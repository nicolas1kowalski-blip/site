        // ======================= V13 : PROPOSER AVANT DE DEMANDER =======================
        // Depuis un fichier chargé : nom de l'objet, informations, définitions devinées d'après les colonnes,
        // exemples réels, application source. Depuis un modèle : Client, Contrat, Produit… On valide, on ne saisit pas.
        const V13_ABBR = {
            id: 'identifiant',
            ident: 'identifiant',
            num: 'numéro',
            no: 'numéro',
            nb: 'nombre',
            mt: 'montant',
            mnt: 'montant',
            lib: 'libellé',
            libelle: 'libellé',
            adr: 'adresse',
            tel: 'téléphone',
            cp: 'code postal',
            dt: 'date',
            dte: 'date',
            deb: 'début',
            fin: 'fin',
            naiss: 'naissance',
            cli: 'client',
            clt: 'client',
            ctr: 'contrat',
            prd: 'produit',
            qte: 'quantité',
            qty: 'quantité',
            px: 'prix',
            pu: 'prix unitaire',
            ttc: 'TTC',
            ht: 'HT',
            tva: 'TVA',
            dev: 'devise',
            stat: 'statut',
            typ: 'type',
            cat: 'catégorie',
            desc: 'description',
            ref: 'référence',
            maj: 'mise à jour',
            modif: 'modification',
            crea: 'création',
            creat: 'création',
            usr: 'utilisateur',
            util: 'utilisateur',
            soc: 'société',
            ste: 'société',
            rs: 'raison sociale',
            prenom: 'prénom',
            tel_port: 'téléphone portable',
            mail: 'e-mail',
            email: 'e-mail',
            pays: 'pays',
            ville: 'ville',
            sexe: 'sexe',
            civ: 'civilité',
            civil: 'civilité'
        };
        const V13_DEFS = [
            [
                /identifiant|^id$|_id$|^id_|numero|numéro|^num/,
                'Identifiant unique qui permet de retrouver {obj} sans ambiguïté.'
            ],
            [/naissance/, 'Date de naissance de la personne.'],
            [/e-mail|mail/, 'Adresse électronique de contact.'],
            [/t[ée]l[ée]phone/, 'Numéro de téléphone de contact.'],
            [/code postal/, "Code postal de l'adresse."],
            [/adresse/, 'Adresse postale.'],
            [/ville/, "Commune de l'adresse."],
            [/pays/, "Pays de l'adresse ou de résidence."],
            [/raison sociale/, "Nom légal de l'entreprise."],
            [/pr[ée]nom/, 'Prénom de la personne.'],
            [/^nom/, "Nom de la personne ou de l'entité."],
            [/siret/, "Numéro SIRET de l'établissement (14 chiffres)."],
            [/siren/, "Numéro SIREN de l'entreprise (9 chiffres)."],
            [/iban/, 'Identifiant bancaire international du compte.'],
            [/montant.*ttc/, 'Montant toutes taxes comprises.'],
            [/montant.*ht/, 'Montant hors taxes.'],
            [/montant|prix|prime|total/, "Montant en devise, tel qu'il figure dans le système source."],
            [/date.*(début|debut|effet)/, 'Date à partir de laquelle {obj} prend effet.'],
            [/date.*(fin|échéance|echeance|terme)/, 'Date à laquelle {obj} prend fin.'],
            [/date.*(création|creation)/, "Date de création de l'enregistrement dans le système."],
            [/date.*(mise à jour|modification)/, "Date de la dernière modification de l'enregistrement."],
            [/date/, 'Date associée à {obj}.'],
            [/statut|état|etat/, 'État actuel de {obj} (ex. actif, résilié, en attente).'],
            [/type|catégorie|categorie|nature/, 'Catégorie qui classe {obj}.'],
            [/quantité/, "Nombre d'unités."],
            [/devise/, 'Monnaie dans laquelle les montants sont exprimés.'],
            [/tva/, 'Taux ou montant de TVA appliqué.'],
            [/libellé|description|commentaire/, 'Texte libre qui décrit {obj}.'],
            [/code/, 'Code court qui identifie une valeur de référence (voir les listes de valeurs).']
        ];
        function v13Humanize(col) {
            let text = String(col || '')
                .replace(/([a-z])([A-Z])/g, '$1 $2')
                .replace(/[_\-.]+/g, ' ')
                .trim()
                .toLowerCase();
            text = text
                .split(' ')
                .map(w => V13_ABBR[w] || w)
                .join(' ');
            return text.charAt(0).toUpperCase() + text.slice(1);
        }
        function v13ObjectName(tableName) {
            let s = v13Humanize(
                String(tableName || '')
                    .replace(/\.(csv|xlsx?|txt|parquet)$/i, '')
                    .replace(/^(tb|tbl|t|ref|dim|fact|src)_/i, '')
            );
            s = s.replace(/s\b/g, m => m).replace(/(\w+)s$/, '$1'); // singulier simple
            return s.charAt(0).toUpperCase() + s.slice(1);
        }
        function v13GuessDef(name, objName) {
            const text = String(name).toLowerCase();
            for (const [re, d] of V13_DEFS)
                if (re.test(text)) return d.replace('{obj}', objName ? 'un(e) ' + objName.toLowerCase() : "l'objet");
            return '';
        }
        function v13ExamplesOf(t, col) {
            const rows = Array.isArray(t.sampleData) ? t.sampleData : [];
            const seen = [];
            rows.forEach(r => {
                const v = r && r[col];
                if (v !== undefined && v !== null && String(v).trim() !== '' && !seen.includes(String(v))) seen.push(String(v));
            });
            return seen.slice(0, 3).join(' ; ');
        }
        function v13SameDefs(name, excludeBoId) {
            const k = v12ListKey ? v12ListKey(name) : String(name).toLowerCase();
            const out = [];
            (state.governance.businessObjects || []).forEach(bo => {
                if (bo.id === excludeBoId) return;
                (boAllAttrRows(bo) || []).forEach(r => {
                    if ((v12ListKey ? v12ListKey(r.el.name) : r.el.name.toLowerCase()) === k && (r.el.definition || '').trim())
                        out.push({ bo, el: r.el });
                });
            });
            return out;
        }
        const V13_TEMPLATES = {
            'Client': [
                'Numéro client|Identifiant unique attribué à la création du client.',
                'Nom|Nom ou raison sociale du client.',
                'Adresse|Adresse postale principale.',
                'Code postal|',
                'Ville|',
                'E-mail|Adresse électronique de contact.',
                'Téléphone|',
                "Date de création|Date d'entrée en relation.",
                'Statut|Actif, inactif, prospect…',
                'Segment|Catégorie commerciale du client.'
            ],
            'Contrat': [
                'Numéro de contrat|Identifiant unique du contrat.',
                'Client|Client titulaire du contrat.',
                'Produit|Produit souscrit.',
                "Date d'effet|Date à laquelle le contrat prend effet.",
                "Date de fin|Date d'échéance ou de résiliation.",
                'Statut|En cours, résilié, suspendu…',
                'Prime|Montant périodique dû par le client.',
                'Périodicité|Mensuelle, trimestrielle, annuelle.'
            ],
            'Produit': [
                'Code produit|Identifiant du produit au catalogue.',
                'Libellé|Nom commercial du produit.',
                'Famille|Regroupement de produits.',
                'Prix|Prix de vente de référence.',
                'Devise|',
                'Statut|Commercialisé, retiré…',
                'Date de lancement|'
            ],
            'Fournisseur': [
                'Code fournisseur|Identifiant du fournisseur.',
                'Raison sociale|Nom légal du fournisseur.',
                "SIRET|Numéro SIRET de l'établissement.",
                'Adresse|',
                'Contact|Personne de contact.',
                'IBAN|Compte bancaire de règlement.',
                'Conditions de paiement|Délai et mode de règlement convenus.'
            ],
            'Facture': [
                'Numéro de facture|Identifiant unique de la facture.',
                'Client|Client facturé.',
                "Date d'émission|",
                "Date d'échéance|Date limite de paiement.",
                'Montant HT|',
                'TVA|',
                'Montant TTC|',
                'Statut|Émise, payée, en retard, annulée.'
            ],
            'Salarié': [
                'Matricule|Identifiant du salarié dans la paie.',
                'Nom|',
                'Prénom|',
                'Date de naissance|',
                "Date d'entrée|Date d'embauche.",
                'Poste|Intitulé de poste.',
                'Service|Service ou direction de rattachement.',
                'Manager|Responsable hiérarchique.'
            ],
            'Sinistre': [
                'Numéro de sinistre|Identifiant unique du sinistre.',
                'Contrat|Contrat concerné.',
                "Date de survenance|Date à laquelle le sinistre s'est produit.",
                'Date de déclaration|',
                'Nature|Type de sinistre.',
                'Montant estimé|Coût prévu.',
                'Montant réglé|Coût payé à ce jour.',
                'Statut|Ouvert, clos, refusé.'
            ]
        };
        function v13ProposeOpen(tableId, tplKey) {
            const tables = Object.values(state.tables).filter(t => t.status === 'ready');
            const t = tableId ? state.tables[tableId] : null;
            const tpl = tplKey ? V13_TEMPLATES[tplKey] : null;
            if (!t && !tpl) {
                return v11ModalOpen(`<div class="flex items-start justify-between gap-3"><div><h3>✨ Décrire un objet sans partir de zéro</h3><p class="text-xs" style="color:var(--v7-muted);margin:4px 0 0">L\'application propose l\'objet, ses informations, des définitions et des exemples. Vous validez ou corrigez.</p>
                    </div>
                    <button class="v11-btn sm" onclick="v11ModalClose()">✕</button></div>
                <div class="mt-4"><div class="text-[10.5px] font-black uppercase" style="color:var(--v7-muted)">À partir d\'un fichier chargé</div>${tables.length ? `<div class="v13-tpl mt-2">${tables.map(x => `<button onclick="v13ProposeOpen('${x.id}')">▦ ${escapeHTML(x.name)} <span style="opacity:.6">· ${(x.headers || []).length} colonnes</span></button>`).join('')}</div>` : '<p class="text-xs italic mt-1" style="color:var(--v7-muted)">Aucun fichier chargé — chargez un CSV ou un Excel dans Sources, ou partez d\'un modèle.</p>'}</div>
                <div class="mt-4"><div class="text-[10.5px] font-black uppercase" style="color:var(--v7-muted)">À partir d\'un modèle</div>
                    <div class="v13-tpl mt-2">${Object.keys(V13_TEMPLATES)
                        .map(k => `<button onclick="v13ProposeOpen(null,'${k}')">🏛️ ${k}</button>`)
                        .join('')}</div></div>`);
            }
            const objName = t ? v13ObjectName(t.name) : tplKey;
            const own = t ? appOwnerOfSource(t.name) : null;
            let attrs;
            if (t)
                attrs = (t.headers || []).map(h => ({
                    on: true,
                    col: h,
                    name: v13Humanize(h),
                    def: v13GuessDef(v13Humanize(h), objName),
                    ex: v13ExamplesOf(t, h)
                }));
            else {
                const heads = tables.flatMap(x => (x.headers || []).map(h => ({ t: x, h })));
                attrs = tpl.map(l => {
                    const [name, def] = l.split('|');
                    const k = v12ListKey(name);
                    const hit = heads.find(x => v12ListKey(v13Humanize(x.h)) === k || v12ListKey(x.h) === k);
                    return {
                        on: true,
                        name,
                        def: def || v13GuessDef(name, objName),
                        col: hit ? hit.h : '',
                        tbl: hit ? hit.t.name : '',
                        ex: hit ? v13ExamplesOf(hit.t, hit.h) : ''
                    };
                });
            }
            v13State.prop = {
                tableId: tableId || '',
                tplKey: tplKey || '',
                name: objName,
                domain: t && t.theme ? t.theme : '',
                attrs,
                own
            };
            const doms = typeof govDomains === 'function' ? govDomains() : [];
            v11ModalOpen(`<div class="flex items-start justify-between gap-3"><div><h3>✨ Proposition : l\'objet « ${escapeHTML(objName)} »</h3><p class="text-xs" style="color:var(--v7-muted);margin:4px 0 0">${t ? `Déduit du fichier <b>${escapeHTML(t.name)}</b>${own ? ', produit par <b>' + escapeHTML(own.name) + '</b>' : ''}` : `Modèle « ${escapeHTML(tplKey)} »${attrs.some(a => a.col) ? ', colonnes reconnues dans vos fichiers' : ''}`}. Décochez ce qui ne vous parle pas, corrigez les noms et définitions : rien n\'est créé avant « Créer ».</p>
                </div>
                <button class="v11-btn sm" onclick="v11ModalClose()">✕</button></div>
                <div class="flex gap-2 items-end mt-3 flex-wrap"><div class="bo-fld" style="flex:1;min-width:200px"><label>Nom de l\'objet</label><input type="text" value="${escapeHTML(objName)}" onchange="v13State.prop.name=this.value.trim()"></div>
                    <div class="bo-fld" style="min-width:160px"><label>Domaine métier</label><input type="text" list="v13domlist" value="${escapeHTML(v13State.prop.domain)}" onchange="v13State.prop.domain=this.value.trim()" placeholder="ex. Finance"><datalist id="v13domlist">${doms.map(d => `<option value="${escapeHTML(d)}">`).join('')}</datalist></div>
                    </div>
                <div class="v13-prev mt-3" style="max-height:52vh;overflow:auto;border:1px solid var(--v11-line);border-radius:12px"><table class="v11-tbl"><thead><tr><th></th>
                    <th>Information</th>
                        <th>Définition proposée</th>
                        <th>Colonne</th>
                        <th>Exemples</th>
                        </tr>
                        </thead>
                        <tbody>${attrs
                            .map(
                                (
                                    a,
                                    i
                                ) => `<tr><td><input type="checkbox" ${a.on ? 'checked' : ''} onchange="v13State.prop.attrs[${i}].on=this.checked"></td>
                    <td><input type="text" value="${escapeHTML(a.name)}" onchange="v13State.prop.attrs[${i}].name=this.value"></td>
                    <td><input type="text" value="${escapeHTML(a.def)}" placeholder="à écrire plus tard" onchange="v13State.prop.attrs[${i}].def=this.value"></td>
                    <td class="text-[11px]" style="font-family:ui-monospace,monospace">${a.col ? escapeHTML((a.tbl ? a.tbl + '.' : '') + a.col) : '<span style="opacity:.5">—</span>'}</td>
                    <td class="text-[11px]" style="color:var(--v7-muted)">${escapeHTML(a.ex || '')}</td>
                    </tr>`
                            )
                            .join('')}</tbody>
                    </table></div>
                <div class="flex justify-between items-center mt-3 gap-2 flex-wrap"><span class="text-[11.5px]" style="color:var(--v7-muted)">${attrs.filter(a => a.def).length} définition(s) proposée(s) sur ${attrs.length} — vous pourrez tout retoucher dans la fiche.</span><span class="flex gap-2"><button class="v11-btn" onclick="v11ModalClose()">Annuler</button><button class="v11-btn pri" onclick="v13ProposeCreate()">Créer l\'objet</button></span></div>`);
        }
        function v13ProposeCreate() {
            const p = v13State.prop;
            if (!p) return;
            const name = (p.name || '').trim();
            if (!name) return showError("Donnez un nom à l'objet.");
            if ((state.governance.businessObjects || []).some(b => b.name.toLowerCase() === name.toLowerCase()))
                return showError('Un objet « ' + name + ' » existe déjà.');
            const t = p.tableId ? state.tables[p.tableId] : null;
            const bo = {
                id: 'bo_' + generateId(),
                name,
                definition: '',
                globalOwner: '',
                domain: p.domain || '',
                contributors: [],
                sources: t ? [{ table: t.name, role: 'maitre' }] : [],
                structure: [],
                elements: [],
                contextRules: { elementId: '', rules: [] },
                producedBy: p.own ? [p.own.id] : [],
                consumedBy: [],
                status: 'Brouillon'
            };
            p.attrs
                .filter(a => a.on && (a.name || '').trim())
                .forEach(a =>
                    bo.elements.push({
                        id: 'be_' + generateId(),
                        name: a.name.trim(),
                        definition: (a.def || '').trim(),
                        owner: '',
                        mappings: a.col ? [{ table: a.tbl || (t ? t.name : ''), col: a.col }] : [],
                        examples: a.ex || '',
                        examplesAuto: !!a.ex,
                        usedBy: []
                    })
                );
            (state.governance.businessObjects = state.governance.businessObjects || []).push(bo);
            if (p.domain) state.governance.domainList = Array.from(new Set([...(state.governance.domainList || []), p.domain]));
            persistAppState();
            v11ModalClose();
            v11Toast(
                `Objet « ${name} » créé avec ${bo.elements.length} information(s)${p.own ? ', produit par ' + p.own.name : ''}. Il reste à désigner un responsable et relire les définitions.`,
                'ok',
                { action: () => v11GoBo(bo.id), actionLabel: 'Ouvrir' }
            );
            v11GoBo(bo.id);
        }
        // ---- bouton dans l'écran Objets et la recherche ----
        Studio.extend(
            'v11Index',
            base =>
                function () {
                    const out = base.apply(this, arguments);
                    out.push({
                        grp: 'Actions',
                        ic: '✨',
                        label: "Décrire un objet à partir d'un fichier ou d'un modèle",
                        key: 'décrire objet fichier modèle proposer créer',
                        go: () => v13ProposeOpen()
                    });
                    return out;
                }
        );
