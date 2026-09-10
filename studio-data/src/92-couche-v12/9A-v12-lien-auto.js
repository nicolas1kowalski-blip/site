        // ======================= V12 : EXTRAIRE — « L'UN OU L'AUTRE LIEN » SANS CHOISIR DE VIA =======================
        // Cas : une table cible est atteignable par PLUSIEURS chemins (ex. CONTRAT → PERSONNE PHYSIQUE → ADRESSE
        // et CONTRAT → PERSONNE MORALE → ADRESSE) et, pour chaque ligne, un seul de ces liens est renseigné.
        // Plutôt que d'imposer le choix d'un « via », on propose (et présélectionne) « le lien renseigné,
        // quel qu'il soit » : toutes les routes sont jointes et la valeur est prise sur la première non vide
        // (COALESCE). Disponible pour les colonnes, les filtres et les critères d'agrégat ; les synthèses,
        // hiérarchies, calculs et agrégats gardent le choix explicite du chemin. Moteur inchangé.
        const V12_VIA_ANY = 'any';
        const V12_VIA_ANY_SELECTS = ['adv-col-via', 'adv-flt-via', 'adv-aggc-via'];
        function v12AnyVias(tableId) {
            return advViaOptions(tableId).map(o => ({ tableId, via: o.key }));
        }
        function v12AnyAliases(map, x) {
            const seen = new Set();
            const out = [];
            v12AnyVias(x.tableId).forEach(v => {
                const a = map[advRouteKey(v.tableId, v.via)];
                if (a && !seen.has(a)) {
                    seen.add(a);
                    out.push(a);
                }
            });
            if (!out.length) out.push(advAlias(map, { tableId: x.tableId, via: '' }));
            return out;
        }
        function v12AnyCoalesce(map, x, col) {
            const al = v12AnyAliases(map, x);
            const refs = al.map(a => `${a}.${sqlIdent(col)}`);
            return refs.length > 1 ? `COALESCE(${refs.join(', ')})` : refs[0];
        }
        // Besoins de jointure : « any » se développe en toutes les routes vers la table.
        Studio.extend(
            'advPlanJoins',
            base =>
                function (baseId, needs) {
                    needs = (Array.isArray(needs) ? needs : []).flatMap(x =>
                        x && typeof x === 'object' && x.via === V12_VIA_ANY
                            ? v12AnyVias(x.tableId).length
                                ? v12AnyVias(x.tableId)
                                : [{ tableId: x.tableId, via: '' }]
                            : [x]
                    );
                    return base(baseId, needs);
                }
        );
        // Colonne : première valeur non vide parmi les routes.
        Studio.extend(
            'advColExpr',
            base =>
                function (map, c) {
                    if (c && c.kind !== 'calc' && c.via === V12_VIA_ANY) {
                        const q = v12AnyCoalesce(map, c, c.col);
                        switch (c.transform) {
                            case 'trim':
                                return `TRIM(CAST(${q} AS VARCHAR))`;
                            case 'upper':
                                return `UPPER(TRIM(CAST(${q} AS VARCHAR)))`;
                            case 'lower':
                                return `LOWER(TRIM(CAST(${q} AS VARCHAR)))`;
                            case 'noaccent':
                                return `strip_accents(TRIM(CAST(${q} AS VARCHAR)))`;
                            default:
                                return q;
                        }
                    }
                    return base(map, c);
                }
        );
        // Filtre / critère : la condition d'origine est produite sur un alias fictif, puis ce dernier est
        // remplacé par le COALESCE des routes.
        Studio.extend(
            'advCondSql',
            base =>
                function (alias, c) {
                    if (c && c.via === V12_VIA_ANY && c.op !== 'list' && v12State.listMap) {
                        const ph = '__v12any__';
                        const sql = base(ph, c);
                        return sql.split(`${ph}.${sqlIdent(c.col)}`).join(v12AnyCoalesce(v12State.listMap, c, c.col));
                    }
                    return base(alias, c);
                }
        );
        // Sélecteur « via » : l'option « l'un ou l'autre » en tête, présélectionnée quand rien n'a été choisi.
        Studio.extend(
            'advViaSync',
            base =>
                function (id, tableId) {
                    const sel = el(id);
                    const before = sel ? sel.value : '';
                    base(id, tableId);
                    const w = el(id + '-wrap');
                    if (!sel || !w || w.classList.contains('hidden') || !V12_VIA_ANY_SELECTS.includes(id)) return;
                    const optionElement = document.createElement('option');
                    optionElement.value = V12_VIA_ANY;
                    optionElement.textContent = "🔀 Le lien renseigné, quel qu'il soit (l'un ou l'autre)";
                    sel.insertBefore(optionElement, sel.firstChild);
                    if (!before || before === V12_VIA_ANY) sel.value = V12_VIA_ANY;
                    const lbl = w.querySelector('span');
                    if (lbl)
                        lbl.title =
                            "Cette table est atteignable par plusieurs liens. Par défaut, la valeur est prise sur le lien renseigné, quel qu'il soit ; choisissez un chemin précis si les liens ont des sens différents (ex. souscripteur / bénéficiaire).";
                }
        );
        Studio.extend(
            'advViaTxt',
            base =>
                function (via) {
                    return via === V12_VIA_ANY ? " via l'un ou l'autre lien" : base(via);
                }
        );
        Studio.extend(
            'advViaLabel',
            base =>
                function (via) {
                    return via === V12_VIA_ANY ? "l'un ou l'autre lien" : base(via);
                }
        );
        Object.assign(V11_LEXIQUE, {
            "l'un ou l'autre lien":
                'Quand une table est reliée par plusieurs chemins, la valeur est prise sur le premier lien renseigné pour chaque ligne, sans choisir de chemin.'
        });
