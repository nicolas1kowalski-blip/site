        // ---- Sauvegarde & partage (bundle fichier) ----

        // ======================= V3 : IMPORT EN MASSE DE LA GOUVERNANCE =======================
        // Remplir la gouvernance depuis un fichier (CSV / Excel) : choix de la cible, MAPPING des
        // colonnes du fichier vers les attributs voulus, aperçu, puis fusion (création / mise à jour).
        const GI_TARGETS = {
            dict: {
                label: '📚 Dictionnaire des colonnes',
                fields: [
                    ['table', 'Table (clé)', true],
                    ['col', 'Colonne (clé)', true],
                    ['definition', 'Définition', false],
                    ['type', 'Type attendu', false],
                    ['sensitivity', 'Sensibilité', false],
                    ['term', 'Terme de glossaire', false]
                ]
            },
            gloss: {
                label: '📖 Glossaire',
                fields: [
                    ['term', 'Terme (clé)', true],
                    ['definition', 'Définition', false],
                    ['table', 'Table liée', false],
                    ['col', 'Colonne liée', false]
                ]
            },
            assets: {
                label: '🖥 Applications & processus',
                fields: [
                    ['name', 'Nom (clé)', true],
                    ['kind', 'Type (application / processus)', false],
                    ['criticality', 'Criticité', false],
                    ['description', 'Description', false],
                    ['owner', 'Responsable', false],
                    ['domain', 'Domaine métier', false],
                    ['apps', 'Applications du processus (séparées par ;)', false]
                ]
            },
            boattr: {
                label: '🏷 Attributs des objets métier (définitions, exemples, sensibilité, terme, nombre de valeurs)',
                fields: [
                    ['bo', 'Objet métier (clé)', true],
                    ['attr', 'Attribut (clé)', true],
                    ['definition', 'Définition', false],
                    ['examples', 'Exemples', false],
                    ['sensitivity', 'Sensibilité', false],
                    ['term', 'Terme de glossaire', false],
                    ['owner', 'Propriétaire', false],
                    ['multi', 'Nombre de valeurs (1 / n / un nombre)', false],
                    ['rename', 'Renommer en', false]
                ]
            },
            usage: {
                label: '🔌 Usages attribut ↔ application',
                fields: [
                    ['bo', 'Objet métier (clé)', true],
                    ['attr', 'Attribut (clé)', true],
                    ['app', 'Application / processus (clé)', true]
                ]
            },
            bo: {
                label: '🏛 Objets métier',
                fields: [
                    ['boname', 'Objet métier (clé)', true],
                    ['definition', 'Définition', false],
                    ['owner', 'Propriétaire', false],
                    ['attrs', 'Attributs (séparés par ;)', false],
                    ['srctable', 'Table source maître', false]
                ]
            },
            boapp: {
                label: '🏛 ↔ 🖥 Applications par objet métier',
                fields: [
                    ['bo', 'Objet métier (clé)', true],
                    ['app', 'Application / processus (clé)', true],
                    ['role', 'Rôle (utilise / produit)', false]
                ]
            }
        };
        let giState = { target: 'dict', cols: [], rows: [], map: {}, fileName: '' };
        function giOpen(target) {
            if (target && GI_TARGETS[target]) giState.target = target;
            giState = { target: giState.target || 'dict', cols: [], rows: [], map: {}, fileName: '' };
            el('uxDrawer').classList.add('wide');
            openUxDrawer({
                sem: '',
                title: '⬆ Import en masse — gouvernance',
                sub: "Choisissez la cible, chargez votre fichier, mappez ses colonnes sur les attributs voulus, vérifiez l'aperçu, importez. Tout reste local.",
                body: '<div id="giBody"></div>',
                foot: `<button onclick="closeBackupCenter()" class="flex-1 bg-white border border-slate-300 rounded-lg py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Fermer (Échap)</button>`
            });
            giRender();
        }
        // Modèle d'alimentation pré-rempli : les CLÉS INTERNES réelles (tables×colonnes,
        // objets×attributs, applications) sont déjà dans le fichier — on ne remplit que les valeurs.
        function giTemplateRows(target) {
            const governance = state.governance;
            if (target === 'dict') {
                const out = [['Table', 'Colonne', 'Définition', 'Type attendu', 'Sensibilité', 'Terme de glossaire']];
                Object.values(state.tables)
                    .filter(t => t.status === 'ready')
                    .forEach(t =>
                        (t.headers || []).forEach(h => {
                            const term = ((governance.dictionary[t.name] || {}).columns || {})[h] || {};
                            out.push([
                                t.name,
                                h,
                                term.definition || '',
                                term.technicalType || '',
                                term.sensitivity || '',
                                term.term || ''
                            ]);
                        })
                    );
                return out;
            }
            if (target === 'gloss') {
                const out = [['Terme', 'Définition', 'Table liée', 'Colonne liée']];
                (governance.glossary || []).forEach(t2 => {
                    const l = (t2.links || [])[0] || {};
                    out.push([t2.term, t2.definition || '', l.table || '', l.col || '']);
                });
                if (out.length === 1) out.push(['Exemple de terme', 'Sa définition métier', '', '']);
                return out;
            }
            if (target === 'assets') {
                const out = [['Nom', 'Type', 'Criticité', 'Description', 'Responsable', 'Domaine', 'Applications']];
                (governance.assets || []).forEach(a =>
                    out.push([
                        a.name,
                        a.kind === 'process' ? 'processus' : 'application',
                        a.criticality || '',
                        a.description || '',
                        a.owner || '',
                        a.domain || '',
                        (a.appIds || [])
                            .map(id => (assetById(id) || {}).name)
                            .filter(Boolean)
                            .join(';')
                    ])
                );
                if (out.length === 1)
                    out.push(
                        ['SAP', 'application', 'Haute', '', '', 'Finance', ''],
                        ['Clôture mensuelle', 'processus', '', '', '', '', 'SAP']
                    );
                return out;
            }
            if (target === 'boattr') {
                // Gabarit aller-retour : on exporte l'état courant, l'utilisateur complète, il réimporte.
                const out = [
                    [
                        'Objet métier',
                        'Attribut',
                        'Définition',
                        'Exemples',
                        'Sensibilité',
                        'Terme de glossaire',
                        'Propriétaire',
                        'Nombre de valeurs',
                        'Renommer en'
                    ]
                ];
                (governance.businessObjects || []).forEach(bo =>
                    boAllAttrRows(bo).forEach(r => {
                        const attribute = r.el;
                        const term = (governance.glossary || []).find(t2 => t2.id === attribute.term);
                        out.push([
                            bo.name,
                            attribute.name,
                            attribute.definition || '',
                            attribute.examples || '',
                            attribute.sensitivity || '',
                            term ? term.term : '',
                            attribute.owner || '',
                            attribute.multi || '',
                            ''
                        ]);
                    })
                );
                if (out.length === 1)
                    out.push([
                        'Client',
                        'Adresse de facturation',
                        'Adresse où est envoyée la facture',
                        '12 rue X, 75001 PARIS',
                        'Personnel (RGPD)',
                        'Adresse',
                        'DSI',
                        'n',
                        ''
                    ]);
                return out;
            }
            if (target === 'usage') {
                const out = [['Objet métier', 'Attribut', 'Application']];
                (governance.businessObjects || []).forEach(bo =>
                    boAllAttrRows(bo).forEach(r => {
                        const used = (r.el.usedBy || []).map(assetById).filter(Boolean);
                        if (used.length) used.forEach(a => out.push([bo.name, r.el.name, a.name]));
                        else out.push([bo.name, r.el.name, '']);
                    })
                );
                return out;
            }
            if (target === 'bo') {
                const out = [['Objet métier', 'Définition', 'Propriétaire', 'Attributs', 'Table source maître']];
                (governance.businessObjects || []).forEach(bo =>
                    out.push([
                        bo.name,
                        bo.definition || '',
                        bo.globalOwner || '',
                        (bo.elements || []).map(e => e.name).join(';'),
                        ((bo.sources || []).find(s => s.role === 'maitre') || (bo.sources || [])[0] || {}).table || ''
                    ])
                );
                if (out.length === 1)
                    out.push([
                        'Client',
                        'Personne ou société avec qui nous avons un contrat',
                        'Paul Otlet',
                        'Nom;Email;Téléphone',
                        'CLIENTS'
                    ]);
                return out;
            }
            if (target === 'boapp') {
                const out = [['Objet métier', 'Application', 'Rôle']];
                (governance.businessObjects || []).forEach(bo => {
                    const emit = (ids, role) =>
                        (ids || [])
                            .map(assetById)
                            .filter(Boolean)
                            .forEach(a => out.push([bo.name, a.name, role]));
                    emit(bo.consumedBy, 'utilise');
                    emit(bo.producedBy, 'produit');
                    if (!(bo.consumedBy || []).length && !(bo.producedBy || []).length) out.push([bo.name, '', 'utilise']);
                });
                if (out.length === 1) out.push(['Client', 'CRM', 'utilise']);
                return out;
            }
            return [[]];
        }
        function giDownloadTemplate() {
            const rows = giTemplateRows(giState.target);
            const csv =
                '\ufeff' +
                rows
                    .map(r =>
                        r
                            .map(v => {
                                const x = String(v == null ? '' : v);
                                return /[;"\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x;
                            })
                            .join(';')
                    )
                    .join('\r\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
            const anchorElement = document.createElement('a');
            anchorElement.href = URL.createObjectURL(blob);
            anchorElement.download = `MODELE_${giState.target.toUpperCase()}_${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(anchorElement);
            anchorElement.click();
            anchorElement.remove();
            showSuccess(
                `📥 Modèle « ${GI_TARGETS[giState.target].label.replace(/^[^ ]+ /, '')} » téléchargé : ${rows.length - 1} ligne(s) pré-remplie(s) avec vos clés — complétez puis réimportez ce fichier tel quel (le mapping sera automatique).`
            );
        }
        function giNorm(x) {
            return String(x == null ? '' : x)
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase()
                .replace(/[^a-z0-9]/g, '');
        }
        function giAutoMap() {
            const T = GI_TARGETS[giState.target];
            giState.map = {};
            const hints = {
                table: ['table', 'source'],
                col: ['colonne', 'col', 'column', 'attribut', 'champ'],
                definition: ['definition', 'description', 'def'],
                type: ['type', 'format'],
                sensitivity: ['sensibilite', 'sensitivity', 'rgpd'],
                term: ['terme', 'term', 'glossaire'],
                name: ['nom', 'name', 'application', 'appli', 'processus'],
                kind: ['type', 'kind', 'nature'],
                criticality: ['criticite', 'criticality'],
                description: ['description', 'commentaire'],
                bo: ['objet', 'objetmetier', 'bo', 'entite'],
                attr: ['attribut', 'attr', 'element', 'champ'],
                app: ['application', 'appli', 'app', 'processus', 'systeme'],
                owner: ['responsable', 'proprietaire', 'owner'],
                domain: ['domaine', 'domain'],
                apps: ['applications', 'applis', 'apps'],
                examples: ['exemples', 'examples', 'exemple', 'example', 'valeursexemples'],
                rename: ['renommeren', 'renommer', 'nouveaunom', 'rename'],
                boname: ['objetmetier', 'objet', 'bo', 'nomobjet', 'nom', 'entite'],
                attrs: ['attributs', 'attrs', 'elements', 'champs', 'attribut'],
                srctable: ['tablesourcemaitre', 'tablesource', 'tablemaitre', 'source', 'table'],
                role: ['role', 'sens', 'nature']
            };
            T.fields.forEach(([f]) => {
                const hs = hints[f] || [f];
                const hit =
                    giState.cols.find(c => {
                        const normalized = giNorm(c);
                        return hs.some(h => normalized === giNorm(h));
                    }) ||
                    giState.cols.find(c => {
                        const normalized = giNorm(c);
                        return hs.some(h => normalized.includes(giNorm(h)));
                    });
                if (hit) giState.map[f] = hit;
            });
        }
        async function giLoadFile(input) {
            const file = input.files && input.files[0];
            if (!file) return;
            giState.fileName = file.name;
            giState.cols = [];
            giState.rows = [];
            try {
                if (/\.(xlsx|xls)$/i.test(file.name)) {
                    if (typeof XLSX === 'undefined')
                        throw new Error('lecture Excel indisponible ici — exportez la feuille en CSV.');
                    const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
                    const pk3 = xlsxPickSheet(wb);
                    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[pk3.name || wb.SheetNames[0]], {
                        header: 1,
                        raw: false,
                        defval: ''
                    });
                    if (!aoa.length) throw new Error('feuille vide.');
                    giState.cols = aoa[0].map(x => String(x));
                    giState.rows = aoa
                        .slice(1)
                        .filter(r => r.some(v => String(v).trim() !== ''))
                        .map(r => {
                            const o = {};
                            giState.cols.forEach((c, i) => (o[c] = r[i] == null ? '' : String(r[i])));
                            return o;
                        });
                } else {
                    const { db, conn } = await getDB();
                    await db.registerFileText('govimport.csv', await file.text());
                    const res = arrowResultToObjects(
                        await conn.query(
                            `SELECT * FROM read_csv_auto('govimport.csv', header=true, all_varchar=true) LIMIT 20000`
                        )
                    );
                    if (!res.length) throw new Error('fichier vide ou illisible.');
                    giState.cols = Object.keys(res[0]);
                    giState.rows = res.map(r => {
                        const o = {};
                        giState.cols.forEach(c => (o[c] = r[c] == null ? '' : String(r[c])));
                        return o;
                    });
                }
                giAutoMap();
            } catch (e) {
                showError('Lecture du fichier impossible : ' + e.message);
            }
            giRender();
        }
        function giVal(row, f) {
            const c = giState.map[f];
            return c ? String(row[c] == null ? '' : row[c]).trim() : '';
        }
        function giRender() {
            const giBodyElement = el('giBody');
            if (!giBodyElement) return;
            const T = GI_TARGETS[giState.target];
            let html = `<div class="dsect"><h4>1 · Que voulez-vous remplir ?</h4>
                <select onchange="giState.target=this.value; giAutoMap(); giRender()" class="w-full border border-slate-300 rounded-lg p-2 text-sm bg-white">${Object.entries(
                    GI_TARGETS
                )
                    .map(([k, t]) => `<option value="${k}" ${giState.target === k ? 'selected' : ''}>${t.label}</option>`)
                    .join('')}</select></div>
                <div class="dsect"><h4>2 · Votre fichier (CSV ou Excel)</h4>
                ${(() => {
                    const n = giTemplateRows(giState.target).length - 1;
                    return `<div class="flex items-start gap-2 bg-indigo-50/60 border border-indigo-100 rounded-lg px-3 py-2 mb-2 text-[11px] text-indigo-900">
                    <span aria-hidden="true">💡</span><div><strong>Partez du modèle pré-rempli</strong> : il contient déjà ${n ? `vos <strong>${n.toLocaleString('fr-FR')} clé(s) interne(s)</strong> (${giState.target === 'dict' ? 'tables × colonnes réelles' : giState.target === 'usage' ? 'objets métier × attributs réels' : giState.target === 'assets' ? 'applications et processus déclarés' : 'termes existants'}) et les valeurs déjà connues` : 'les bons en-têtes de colonnes'} — complétez les cases vides dans votre tableur, réimportez tel quel : le mapping sera reconnu automatiquement.</div>
                    <button onclick="giDownloadTemplate()" class="ml-auto shrink-0 bg-white border border-indigo-300 text-indigo-700 font-bold px-3 py-1.5 rounded-lg hover:bg-indigo-100">📥 Télécharger le modèle</button></div>`;
                })()}
                <div class="flex items-center gap-2"><button onclick="el('giFile').click()" class="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-2 rounded-lg">📄 Choisir un fichier…</button>
                <input type="file" id="giFile" accept=".csv,.txt,.xlsx,.xls" class="hidden" onchange="giLoadFile(this)">
                ${giState.fileName ? `<span class="text-xs font-bold text-slate-600">${escapeHTML(giState.fileName)}</span><span class="text-[11px] text-slate-400">${giState.rows.length.toLocaleString('fr-FR')} ligne(s), ${giState.cols.length} colonne(s)</span>` : '<span class="text-[11px] text-slate-400 italic">1 ligne = 1 élément à créer ou mettre à jour.</span>'}</div>
                    </div>`;
            if (giState.cols.length) {
                html += `<div class="dsect"><h4>3 · Mappez les attributs à importer</h4><div class="space-y-1.5">${T.fields
                    .map(
                        ([f, lbl, req]) => `
                    <div class="flex items-center gap-2 text-xs"><span class="w-56 ${req ? 'font-bold text-slate-700' : 'text-slate-500'}">${escapeHTML(lbl)}${req ? ' *' : ''}</span>
                    <select onchange="giState.map['${f}']=this.value; giRender()" class="flex-1 border border-slate-200 rounded p-1.5 bg-white"><option value="">— ne pas importer —</option>${giState.cols.map(c => `<option value="${escapeHTML(c)}" ${giState.map[f] === c ? 'selected' : ''}>${escapeHTML(c)}</option>`).join('')}</select></div>`
                    )
                    .join('')}</div>
                    <p class="text-[10px] text-slate-400 mt-1.5">* champs clés obligatoires — ils identifient l'élément (mise à jour s'il existe, création sinon). Les champs non mappés ne sont pas touchés.</p>
                        </div>`;
                const missing = T.fields.filter(([f, , req]) => req && !giState.map[f]);
                const prev = giState.rows.slice(0, 5);
                html += `<div class="dsect"><h4>4 · Aperçu (5 premières lignes)</h4>
                    <div class="overflow-auto border border-slate-100 rounded-lg"><table class="w-full text-[11px]"><thead class="bg-slate-50 font-bold"><tr>${T.fields
                        .filter(([f]) => giState.map[f])
                        .map(([f, lbl]) => `<th class="p-1.5 text-left">${escapeHTML(lbl)}</th>`)
                        .join('')}</tr></thead>
                    <tbody>${prev
                        .map(
                            r =>
                                `<tr class="border-t border-slate-100">${T.fields
                                    .filter(([f]) => giState.map[f])
                                    .map(([f]) => `<td class="p-1.5">${escapeHTML(giVal(r, f))}</td>`)
                                    .join('')}</tr>`
                        )
                        .join('')}</tbody></table></div>
                    ${
                        missing.length
                            ? `<p class="text-[11px] text-red-600 font-bold mt-2">Champs clés manquants : ${missing.map(m => escapeHTML(m[1])).join(', ')}</p>`
                            : `<button onclick="giApply(this)" class="mt-3 w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2.5 rounded-lg">✔ Importer ${giState.rows.length.toLocaleString('fr-FR')} ligne(s)</button>`
                    }
                    <div id="giReport" class="mt-2"></div></div>`;
            }
            giBodyElement.innerHTML = html;
        }
        function giApply(btn) {
            if (btn) btn.disabled = true;
            const governance = state.governance;
            let created = 0,
                updated = 0,
                skipped = 0;
            const skips = {};
            const skip = (reason, detail) => {
                skipped++;
                const s2 = (skips[reason] = skips[reason] || { n: 0, ex: [] });
                s2.n++;
                const d = detail == null ? '' : String(detail).trim();
                if (d && s2.ex.length < 5 && !s2.ex.includes(d)) s2.ex.push(d);
            };
            const setIf = (obj, k, v) => {
                if (v !== '') {
                    if (String(obj[k] || '') !== v) {
                        obj[k] = v;
                        return true;
                    }
                }
                return false;
            };
            try {
                giState.rows.forEach(row => {
                    if (giState.target === 'dict') {
                        const tn = giVal(row, 'table'),
                            col = giVal(row, 'col');
                        if (!tn || !col) {
                            skip('Table ou colonne vide dans le fichier');
                            return;
                        }
                        const dictionaryEntry = ensureDictEntry(tn);
                        dictionaryEntry.columns[col] = dictionaryEntry.columns[col] || {
                            definition: '',
                            technicalType: '',
                            sensitivity: '',
                            term: ''
                        };
                        const isNew = !dictionaryEntry.columns[col].definition && !dictionaryEntry.columns[col].term;
                        let ch = false;
                        ch = setIf(dictionaryEntry.columns[col], 'definition', giVal(row, 'definition')) || ch;
                        ch = setIf(dictionaryEntry.columns[col], 'technicalType', giVal(row, 'type')) || ch;
                        ch = setIf(dictionaryEntry.columns[col], 'sensitivity', giVal(row, 'sensitivity')) || ch;
                        ch = setIf(dictionaryEntry.columns[col], 'term', giVal(row, 'term')) || ch;
                        ch ? (isNew ? created++ : updated++) : skip('Déjà identique — aucune valeur à changer', tn + '.' + col);
                    } else if (giState.target === 'gloss') {
                        const term = giVal(row, 'term');
                        if (!term) {
                            skip('Terme vide dans le fichier');
                            return;
                        }
                        let e2 = governance.glossary.find(x => giNorm(x.term) === giNorm(term));
                        if (!e2) {
                            e2 = { id: 'gl_' + generateId(), term, definition: '', links: [] };
                            governance.glossary.push(e2);
                            created++;
                        } else updated++;
                        setIf(e2, 'definition', giVal(row, 'definition'));
                        const tn = giVal(row, 'table'),
                            col = giVal(row, 'col');
                        if (tn && col && !(e2.links || []).some(l => l.table === tn && l.col === col)) {
                            e2.links = e2.links || [];
                            e2.links.push({ table: tn, col });
                        }
                    } else if (giState.target === 'assets') {
                        const name = giVal(row, 'name');
                        if (!name) {
                            skip('Nom vide dans le fichier');
                            return;
                        }
                        let asset = (governance.assets || []).find(x => giNorm(x.name) === giNorm(name));
                        const kind = /proc/i.test(giVal(row, 'kind')) ? 'process' : 'app';
                        if (!asset) {
                            asset = { id: 'as_' + generateId(), kind, name, criticality: '', description: '' };
                            governance.assets.push(asset);
                            created++;
                        } else updated++;
                        if (giVal(row, 'kind')) asset.kind = kind;
                        setIf(asset, 'criticality', giVal(row, 'criticality'));
                        setIf(asset, 'description', giVal(row, 'description'));
                        setIf(asset, 'owner', giVal(row, 'owner'));
                        setIf(asset, 'domain', giVal(row, 'domain'));
                        const appsList = giVal(row, 'apps')
                            .split(';')
                            .map(x => x.trim())
                            .filter(Boolean);
                        if (appsList.length && asset.kind === 'process') {
                            asset.appIds = asset.appIds || [];
                            appsList.forEach(nm2 => {
                                let ap = (governance.assets || []).find(
                                    x => x.kind === 'app' && giNorm(x.name) === giNorm(nm2)
                                );
                                if (!ap) {
                                    ap = {
                                        id: 'as_' + generateId(),
                                        kind: 'app',
                                        name: nm2,
                                        criticality: '',
                                        description: '',
                                        domain: '',
                                        appIds: []
                                    };
                                    governance.assets.push(ap);
                                    created++;
                                }
                                if (!asset.appIds.includes(ap.id)) asset.appIds.push(ap.id);
                            });
                        }
                    } else if (giState.target === 'boattr') {
                        const boN = giVal(row, 'bo'),
                            attrN = giVal(row, 'attr');
                        if (!boN || !attrN) {
                            skip('Objet métier ou attribut vide dans le fichier');
                            return;
                        }
                        const bo = (governance.businessObjects || []).find(x => giNorm(x.name) === giNorm(boN));
                        if (!bo) {
                            skip("Objet métier introuvable — créez-le d'abord (cible « 🏛 Objets métier »)", boN);
                            return;
                        }
                        const attributeRow = boAllAttrRows(bo).find(x => giNorm(x.el.name) === giNorm(attrN));
                        if (!attributeRow) {
                            skip('Attribut introuvable dans cet objet métier', boN + ' · ' + attrN);
                            return;
                        }
                        const e2 = attributeRow.el;
                        const isNew = !e2.definition && !e2.examples && !e2.sensitivity && !e2.term;
                        let ch = false;
                        ch = setIf(e2, 'definition', giVal(row, 'definition')) || ch;
                        ch = setIf(e2, 'examples', giVal(row, 'examples')) || ch;
                        ch = setIf(e2, 'owner', giVal(row, 'owner')) || ch;
                        // La sensibilité doit rester dans la liste connue, sinon on le dit plutôt que
                        // d'enregistrer une valeur que plus rien ne saura interpréter.
                        const sv = giVal(row, 'sensitivity');
                        if (sv) {
                            const m2 = SENSITIVITY_OPTS.find(o => giNorm(o) === giNorm(sv));
                            if (m2) ch = setIf(e2, 'sensitivity', m2) || ch;
                            else
                                skip(
                                    'Sensibilité inconnue — valeurs admises : ' + SENSITIVITY_OPTS.join(', '),
                                    boN + ' · ' + attrN + ' → ' + sv
                                );
                        }
                        // Le terme est saisi en clair dans le fichier ; on le résout vers le glossaire.
                        const tv = giVal(row, 'term');
                        if (tv) {
                            const term = (governance.glossary || []).find(t2 => giNorm(t2.term) === giNorm(tv));
                            if (term) ch = setIf(e2, 'term', term.id) || ch;
                            else
                                skip(
                                    "Terme de glossaire introuvable — ajoutez-le d'abord (cible « 📖 Glossaire »)",
                                    boN + ' · ' + attrN + ' → ' + tv
                                );
                        }
                        // Multiplicité : « 1 », « n » ou un nombre. Une valeur illisible est signalée
                        // plutôt qu'enregistrée — sinon l'attribut porterait une multiplicité fantôme.
                        const mv = giVal(row, 'multi');
                        if (mv) {
                            const mn = boMultiNorm(mv);
                            if (mn === null)
                                skip(
                                    'Nombre de valeurs non reconnu — attendu « 1 », « n » ou un nombre',
                                    boN + ' · ' + attrN + ' → ' + mv
                                );
                            else ch = setIf(e2, 'multi', mn) || ch;
                        }
                        // Renommage explicite : jamais implicite, pour ne pas casser les rattachements.
                        const rn = giVal(row, 'rename');
                        if (rn && giNorm(rn) !== giNorm(e2.name)) {
                            e2.name = rn;
                            ch = true;
                        }
                        ch
                            ? isNew
                                ? created++
                                : updated++
                            : skip('Déjà identique — aucune valeur à changer', boN + ' · ' + attrN);
                    } else if (giState.target === 'usage') {
                        const boN = giVal(row, 'bo'),
                            attrN = giVal(row, 'attr'),
                            appN = giVal(row, 'app');
                        if (!boN || !attrN || !appN) {
                            skip('Clé obligatoire vide (objet, attribut ou application)');
                            return;
                        }
                        const bo = (governance.businessObjects || []).find(x => giNorm(x.name) === giNorm(boN));
                        if (!bo) {
                            skip("Objet métier introuvable — créez-le d'abord (cible « 🏛 Objets métier »)", boN);
                            return;
                        }
                        let asset = (governance.assets || []).find(x => giNorm(x.name) === giNorm(appN));
                        if (!asset) {
                            asset = { id: 'as_' + generateId(), kind: 'app', name: appN, criticality: '' };
                            governance.assets.push(asset);
                            created++;
                        }
                        const attributeRow = boAllAttrRows(bo).find(x => giNorm(x.el.name) === giNorm(attrN));
                        if (!attributeRow) {
                            skip("Attribut introuvable dans l'objet métier", boN + ' · ' + attrN);
                            return;
                        }
                        attributeRow.el.usedBy = attributeRow.el.usedBy || [];
                        if (!attributeRow.el.usedBy.includes(asset.id)) {
                            attributeRow.el.usedBy.push(asset.id);
                            updated++;
                        } else skip('Usage déjà enregistré (aucun changement)', boN + ' · ' + attrN + ' → ' + appN);
                    } else if (giState.target === 'bo') {
                        const name = giVal(row, 'boname');
                        if (!name) {
                            skip("Nom d'objet métier vide dans le fichier");
                            return;
                        }
                        let bo = (governance.businessObjects || []).find(x => giNorm(x.name) === giNorm(name));
                        if (!bo) {
                            bo = {
                                id: 'bo_' + generateId(),
                                name,
                                definition: '',
                                globalOwner: '',
                                contributors: [],
                                sources: [],
                                elements: [],
                                contextRules: { elementId: '', rules: [] }
                            };
                            governance.businessObjects.push(bo);
                            created++;
                        } else updated++;
                        setIf(bo, 'definition', giVal(row, 'definition'));
                        setIf(bo, 'globalOwner', giVal(row, 'owner'));
                        giVal(row, 'attrs')
                            .split(';')
                            .map(x => x.trim())
                            .filter(Boolean)
                            .forEach(an => {
                                bo.elements = bo.elements || [];
                                if (!bo.elements.some(e2 => giNorm(e2.name) === giNorm(an)))
                                    bo.elements.push({ id: 'be_' + generateId(), name: an, owner: '', mappings: [] });
                            });
                        const stn = giVal(row, 'srctable');
                        if (stn) {
                            bo.sources = bo.sources || [];
                            const real = tableByName(stn) ? tableByName(stn).name : stn;
                            if (!bo.sources.some(s2 => giNorm(s2.table) === giNorm(real)))
                                bo.sources.push({ table: real, role: 'maitre' });
                        }
                    } else if (giState.target === 'boapp') {
                        const boN = giVal(row, 'bo'),
                            appN = giVal(row, 'app');
                        if (!boN || !appN) {
                            skip('Clé obligatoire vide (objet métier ou application)');
                            return;
                        }
                        const bo = (governance.businessObjects || []).find(x => giNorm(x.name) === giNorm(boN));
                        if (!bo) {
                            skip("Objet métier introuvable — créez-le d'abord (cible « 🏛 Objets métier »)", boN);
                            return;
                        }
                        let asset = (governance.assets || []).find(x => giNorm(x.name) === giNorm(appN));
                        if (!asset) {
                            asset = { id: 'as_' + generateId(), kind: 'app', name: appN, criticality: '' };
                            governance.assets.push(asset);
                            created++;
                        }
                        const field = /produ/i.test(giVal(row, 'role')) ? 'producedBy' : 'consumedBy';
                        bo[field] = bo[field] || [];
                        if (!bo[field].includes(asset.id)) {
                            bo[field].push(asset.id);
                            updated++;
                        } else skip('Lien déjà enregistré (aucun changement)', boN + ' → ' + appN);
                    }
                });
                persistAppState();
                renderGovernance();
                const giReportElement = el('giReport');
                const reasons = Object.entries(skips);
                // Aide au diagnostic « introuvable » : on liste les noms réellement existants pour
                // repérer un écart d'orthographe (espace, pluriel, code…) au premier coup d'œil.
                let existHint = '';
                if (
                    reasons.some(([r]) => r.includes('Objet métier introuvable')) &&
                    (governance.businessObjects || []).length
                ) {
                    const names = (governance.businessObjects || []).map(b2 => b2.name);
                    existHint += `<div class="mt-1.5 text-[10.5px] text-slate-500"><strong>Objets métier existants</strong> (comparez l'orthographe exacte) : ${names.slice(0, 20).map(escapeHTML).join(', ')}${names.length > 20 ? '…' : ''}</div>`;
                }
                const detailHtml = reasons.length
                    ? `<div class="mt-2 pt-2 border-t border-emerald-200/70"><div class="text-[11px] font-bold text-slate-600 mb-1">Détail des ${skipped} ligne(s) ignorée(s) :</div>
                        <ul class="space-y-1">${reasons
                            .sort((a, b) => b[1].n - a[1].n)
                            .map(
                                ([r, s2]) =>
                                    `<li class="text-[11px] text-slate-700 flex gap-1.5"><span class="shrink-0 font-black text-amber-600">${s2.n}</span><span><span class="font-semibold">${escapeHTML(r)}</span>${s2.ex.length ? ` <span class="text-slate-500">— ex : ${s2.ex.map(escapeHTML).join(', ')}${s2.n > s2.ex.length ? '…' : ''}</span>` : ''}</span></li>`
                            )
                            .join('')}</ul>${existHint}</div>`
                    : '';
                if (giReportElement)
                    giReportElement.innerHTML = `<div class="text-xs rounded-lg border ${skipped && !created && !updated ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-800'} px-3 py-2"><div class="font-bold">${skipped && !created && !updated ? '⚠️ Aucune ligne importée' : '✔ Import terminé'} : ${created} créé(s) · ${updated} mis à jour · ${skipped} ignoré(s).</div>${detailHtml}</div>`;
                showSuccess(`⬆ Import gouvernance : ${created} créé(s), ${updated} mis à jour, ${skipped} ignoré(s).`);
            } catch (e) {
                showError('Import impossible : ' + e.message);
            } finally {
                if (btn) btn.disabled = false;
            }
        }
