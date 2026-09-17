        // ======================= V13 : CODIFICATION — L'ÉCRAN =======================
        // L'écran 17, ajouté par la couche V13 : la page livrée n'en compte que seize, et l'on ne touche pas
        // aux fichiers de base. La section est donc créée au chargement, à côté des autres, et « switchTab »
        // est enrichi pour la montrer, la cacher et la rendre comme il le fait pour les seize premières.
        //
        // Le moteur (règles, synonymes, SQL, bilan) est dans A6-v13-codification-moteur.js.

        const V13_ECRAN_CODIFICATION = 17;
        /** Combien de lignes on montre d'un coup : de quoi juger sans noyer le navigateur. */
        const V13_LIGNES_MONTREES = 200;
        /** Combien de questions l’écran pose d’un coup ; l’export, lui, ne connaît pas de plafond. */
        const V13_CAS_MONTRES = 50;
        /** Ce que l'écran garde entre deux rendus : la codification ouverte, son dernier résultat, sa revue. */
        const v13Codification = { ouverte: '', resultat: null, casARevoir: [], branche: null, enCours: false };

        /** Une codification toute neuve, avec les seuils qui vont bien pour des libellés d'équipements. */
        function v13CodificationNeuve() {
            return {
                id: 'cd_' + generateId(),
                nom: 'Nouvelle codification',
                source: '',
                colonneLibelle: '',
                colonneCodeExistant: '',
                nomenclature: '',
                colonneCode: '',
                colonneLibelleRef: '',
                niveaux: [],
                comparaisons: [],
                restreindreSource: '',
                restreindreNomenclature: '',
                synonymes: [],
                regles: [],
                correspondances: [],
                seuilAuto: 0.99,
                seuilRevoir: 0.45,
                methode: 'mots',
                decisions: {}
            };
        }
        function v13CodificationOuverte() {
            return v13CodificationParIdentifiant(v13Codification.ouverte);
        }
        function v13AjouterUneCodification() {
            const codification = v13CodificationNeuve();
            v13Codifications().push(codification);
            v13Codification.ouverte = codification.id;
            v13Codification.resultat = null;
            v13Codification.casARevoir = [];
            persistAppState();
            renderCodification();
        }
        function v13OuvrirLaCodification(identifiant) {
            v13Codification.ouverte = identifiant;
            v13Codification.resultat = null;
            v13Codification.casARevoir = [];
            v13Codification.branche = null;
            renderCodification();
        }
        function v13SupprimerLaCodification(identifiant) {
            const codification = v13CodificationParIdentifiant(identifiant);
            if (!codification || !confirm(`Supprimer la codification « ${codification.nom} » ?`)) return;
            state.codifications = v13Codifications().filter(candidate => candidate.id !== identifiant);
            v13Codification.ouverte = (v13Codifications()[0] || {}).id || '';
            v13Codification.resultat = null;
            persistAppState();
            renderCodification();
        }
        /** Écrit un réglage de la codification ouverte ; « niveaux » et les listes de mots sont saisis en clair. */
        function v13EcrireDansLaCodification(champ, valeur) {
            const codification = v13CodificationOuverte();
            if (!codification) return;
            const chiffres = ['seuilAuto', 'seuilRevoir', 'propositions'];
            codification[champ] = chiffres.includes(champ) ? parseFloat(valeur) || 0 : valeur;
            persistAppState();
            renderCodification();
        }
        /** Les mots d'une saisie libre : séparés par des virgules ou des points-virgules, les vides écartés. */
        function v13MotsSaisis(saisie) {
            return String(saisie || '')
                .split(/[;,]/)
                .map(mot => mot.trim())
                .filter(Boolean);
        }
        function v13SaisieDesMots(mots) {
            return (mots || []).join(' ; ');
        }

        // ---- les niveaux de l'arbre ----
        function v13AjouterUnNiveau(identifiant) {
            const codification = v13CodificationParIdentifiant(identifiant);
            const choisi = (el('v13-codif-niveau') || {}).value || '';
            if (!codification || !choisi || (codification.niveaux || []).includes(choisi)) return;
            codification.niveaux = (codification.niveaux || []).concat([choisi]);
            persistAppState();
            renderCodification();
        }
        function v13RetirerUnNiveau(identifiant, rang) {
            const codification = v13CodificationParIdentifiant(identifiant);
            if (!codification) return;
            codification.niveaux = (codification.niveaux || []).filter((niveau, position) => position !== rang);
            persistAppState();
            renderCodification();
        }

        // ---- ce que l'on compare ----
        function v13AjouterUneComparaison(identifiant) {
            const codification = v13CodificationParIdentifiant(identifiant);
            if (!codification) return;
            codification.comparaisons = (codification.comparaisons || []).concat([
                {
                    id: 'cp_' + generateId(),
                    colonneSource: codification.colonneLibelle,
                    colonneNomenclature: codification.colonneLibelleRef,
                    poids: 1,
                    methode: ''
                }
            ]);
            persistAppState();
            renderCodification();
        }
        function v13EcrireDansLaComparaison(identifiant, identifiantComparaison, champ, valeur) {
            const codification = v13CodificationParIdentifiant(identifiant);
            const comparaison = ((codification || {}).comparaisons || []).find(
                candidate => candidate.id === identifiantComparaison
            );
            if (!comparaison) return;
            comparaison[champ] = champ === 'poids' ? parseFloat(valeur) || 1 : valeur;
            persistAppState();
            renderCodification();
        }
        function v13RetirerUneComparaison(identifiant, rang) {
            const codification = v13CodificationParIdentifiant(identifiant);
            if (!codification) return;
            codification.comparaisons = (codification.comparaisons || []).filter((comparaison, position) => position !== rang);
            persistAppState();
            renderCodification();
        }

        // ---- les synonymes et les règles ----
        function v13AjouterUnSynonyme(identifiant) {
            const codification = v13CodificationParIdentifiant(identifiant);
            if (!codification) return;
            codification.synonymes = (codification.synonymes || []).concat([
                { id: 'sy_' + generateId(), motRetenu: '', variantes: [], proche: false }
            ]);
            persistAppState();
            renderCodification();
        }
        function v13EcrireDansLeSynonyme(identifiant, identifiantSynonyme, champ, valeur) {
            const codification = v13CodificationParIdentifiant(identifiant);
            const synonyme = ((codification || {}).synonymes || []).find(candidate => candidate.id === identifiantSynonyme);
            if (!synonyme) return;
            synonyme[champ] = champ === 'variantes' ? v13MotsSaisis(valeur) : valeur;
            persistAppState();
            renderCodification();
        }
        function v13RetirerUnSynonyme(identifiant, rang) {
            const codification = v13CodificationParIdentifiant(identifiant);
            if (!codification) return;
            codification.synonymes = (codification.synonymes || []).filter((synonyme, position) => position !== rang);
            persistAppState();
            renderCodification();
        }
        function v13AjouterUneRegle(identifiant) {
            const codification = v13CodificationParIdentifiant(identifiant);
            if (!codification) return;
            codification.regles = (codification.regles || []).concat([
                {
                    id: 'rg_' + generateId(),
                    actif: true,
                    code: '',
                    colonne: '',
                    type: 'motscles',
                    contient: [],
                    ou: false,
                    sauf: [],
                    motif: ''
                }
            ]);
            persistAppState();
            renderCodification();
        }
        function v13EcrireDansLaRegle(identifiant, identifiantRegle, champ, valeur) {
            const codification = v13CodificationParIdentifiant(identifiant);
            const regle = ((codification || {}).regles || []).find(candidate => candidate.id === identifiantRegle);
            if (!regle) return;
            regle[champ] = champ === 'contient' || champ === 'sauf' ? v13MotsSaisis(valeur) : valeur;
            persistAppState();
            renderCodification();
        }
        function v13MonterLaRegle(identifiant, rang) {
            const codification = v13CodificationParIdentifiant(identifiant);
            if (!codification || rang <= 0) return;
            const regles = (codification.regles || []).slice();
            const permutee = regles[rang - 1];
            regles[rang - 1] = regles[rang];
            regles[rang] = permutee;
            codification.regles = regles;
            persistAppState();
            renderCodification();
        }
        function v13RetirerUneRegle(identifiant, rang) {
            const codification = v13CodificationParIdentifiant(identifiant);
            if (!codification) return;
            codification.regles = (codification.regles || []).filter((regle, position) => position !== rang);
            persistAppState();
            renderCodification();
        }

        // ---- l'exécution ----
        /** Code la liste, relève le bilan sur la totalité, et rapporte les cas à revoir. */
        async function v13CoderLaListe(identifiant) {
            const codification = v13CodificationParIdentifiant(identifiant);
            if (!codification) return;
            v13Codification.enCours = true;
            renderCodification();
            bgTaskStart('Codification de la liste');
            // DuckDB dans le navigateur n’a pas toujours de dossier temporaire inscriptible : dès qu’une
            // requête déborde, il échoue sur « HTML FileReaders do not support writing ». Comme les actions
            // d’Extraire, la codification est donc relancée en mémoire pure, limite relevée, si cela arrive.
            v12State.noSpill++;
            try {
                const { conn } = await getDB();
                // La liste n’est codée qu’une fois : le résultat est déposé dans une table, puis relu trois fois.
                const table = sqlIdent(V13_TABLE_CODEE);
                await conn.query(`DROP TABLE IF EXISTS ${table}`);
                await conn.query(`CREATE TABLE ${table} AS\n${v13SqlDeCodification(codification)}`);
                const lignes = arrowResultToObjects(
                    await conn.query(
                        `SELECT * EXCLUDE (__rn) FROM ${table} ORDER BY __statut, __rn LIMIT ${V13_LIGNES_MONTREES}`
                    )
                );
                const comptes = arrowResultToObjects(
                    await conn.query(`SELECT __statut AS statut, COUNT(*)::BIGINT AS lignes FROM ${table} GROUP BY __statut`)
                ).map(compte => ({ statut: String(compte.statut), lignes: Number(compte.lignes) }));
                // Le décompte d’entrée est relu sur la source : c’est lui qui prouve qu’aucune ligne n’a été
                // perdue ni démultipliée, et c’est la première chose que l’on veut vérifier sur un vrai volume.
                const tableSource = sqlIdent(duckTableName(tableByName(codification.source).id));
                const lignesEnEntree = Number(
                    arrowResultToObjects(await conn.query(`SELECT COUNT(*)::BIGINT AS lignes FROM ${tableSource}`))[0].lignes
                );
                v13Codification.resultat = { lignes, bilan: v13BilanDeCodification(comptes), lignesEnEntree };
                // Le contrôle de la colonne de branche : deux GROUP BY, et l’on sait si les deux côtés
                // parlent de la même chose. C’est la réponse à « pourquoi aucune proposition de ma famille ».
                const controle = v13SqlDuControleDeBranche(codification);
                v13Codification.branche = controle
                    ? v13BilanDuControleDeBranche(arrowResultToObjects(await conn.query(controle)))
                    : null;
                // Quand les familles ne se retrouvent pas, on essaie les AUTRES colonnes des deux fichiers :
                // c'est ce qui permet de dire « prenez plutôt celle-là » au lieu de « ça ne correspond pas ».
                if (v13Codification.branche && !v13Codification.branche.accord)
                    v13Codification.branche.conseils = await v13ConseilsDesColonnes(codification, conn);
                v13Codification.casARevoir = v13RangerLesCasARevoir(
                    arrowResultToObjects(await conn.query(v13SqlDesCasARevoir(codification, V13_CAS_MONTRES, V13_TABLE_CODEE)))
                );
                bgTaskEnd('🏷️ ' + v13Codification.resultat.bilan.phrase);
            } catch (erreur) {
                bgTaskEnd();
                showError('Codification impossible : ' + v13PhraseDeLErreur(erreur));
            } finally {
                v12State.noSpill--;
                v13Codification.enCours = false;
                renderCodification();
            }
        }
        /** Les propositions rangées par ligne, la plus probable en tête. */
        function v13RangerLesCasARevoir(lignes) {
            const cas = [];
            lignes.forEach(ligne => {
                const rang = Number(ligne.rang);
                let trouve = cas.find(candidate => candidate.rang === rang);
                if (!trouve) {
                    trouve = {
                        rang,
                        libelle: String(ligne.libelle || ''),
                        combien: Number(ligne.combien) || 1,
                        famille: String(ligne.famille || ''),
                        candidats: []
                    };
                    cas.push(trouve);
                }
                trouve.candidats.push({
                    code: String(ligne.code || ''),
                    libelleRef: String(ligne.libelleRef || ''),
                    chemin: String(ligne.chemin || ''),
                    memeBranche: ligne.memeBranche === undefined ? true : !!ligne.memeBranche,
                    score: Number(ligne.score) || 0
                });
            });
            return cas;
        }
        /**
         * Tranche un cas : la ligne reçoit son code, le libellé entre dans la table de correspondance, et l'on
         * recode. C'est ce qui fait qu'un cas tranché une fois ne revient jamais.
         */
        async function v13TrancherLeCas(identifiant, rang, libelle, code, combien) {
            const codification = v13CodificationParIdentifiant(identifiant);
            if (!codification) return;
            const lignes = Number(combien) || 1;
            codification.decisions = Object.assign({}, codification.decisions || {});
            codification.decisions[String(rang)] = code;
            // La décision est rangée sous le LIBELLÉ, pas sous la ligne : toutes celles qui portent ce
            // libellé sont codées du même coup, aujourd’hui comme à la prochaine livraison.
            codification.correspondances = v13CorrespondanceApresDecision(codification, libelle, code);
            codification.refus = code
                ? v13RefusSansLeLibelle(codification, libelle)
                : v13RefusApresDecision(codification, libelle);
            persistAppState();
            const combienDit = lignes > 1 ? ` — ${lignes.toLocaleString('fr-FR')} lignes codées d’un coup` : '';
            showSuccess(
                code
                    ? `« ${libelle} » → ${code}${combienDit}, retenu pour les prochaines fois.`
                    : `« ${libelle} » écarté : on ne vous le repropose plus.`
            );
            await v13CoderLaListe(identifiant);
        }

        // ---- le rendu ----
        /** Une liste déroulante de l'écran, avec son invite, ses valeurs et ce qu'elle déclenche. */
        function v13ListeDeroulante(identifiantChamp, invite, valeurs, valeurCourante, auChangement) {
            const options = valeurs
                .map(
                    valeur =>
                        `<option value="${escapeHTML(valeur)}" ${valeur === valeurCourante ? 'selected' : ''}>${escapeHTML(valeur)}</option>`
                )
                .join('');
            return `<select id="${identifiantChamp}" onchange="${auChangement}" class="border border-slate-300 p-1.5 rounded text-xs bg-white w-full">
                <option value="">${escapeHTML(invite)}</option>${options}</select>`;
        }
        /** Les colonnes d'une source, ou rien si elle n'est pas chargée. */
        function v13ColonnesDe(nomSource) {
            const table = tableByName(nomSource);
            return table ? table.headers || [] : [];
        }
        /** Un réglage : son intitulé au-dessus, sa liste en dessous. */
        function v13Reglage(intitule, champ) {
            return `<label class="flex flex-col gap-1 text-[11px] font-bold text-slate-500">${escapeHTML(intitule)}${champ}</label>`;
        }
        /** ① La liste à coder et la nomenclature de référence. */
        function v13BlocDesSources(codification) {
            const identifiant = codification.id;
            const ecrire = champ => `v13EcrireDansLaCodification('${champ}', this.value)`;
            const sources = Object.keys(state.tables).map(cle => state.tables[cle].name);
            return `<div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                ${v13Reglage('Liste reçue', v13ListeDeroulante('v13-codif-source', '—', sources, codification.source, ecrire('source')))}
                ${v13Reglage('Colonne du libellé', v13ListeDeroulante('v13-codif-libelle', '—', v13ColonnesDe(codification.source), codification.colonneLibelle, ecrire('colonneLibelle')))}
                ${v13Reglage('Code déjà fourni (facultatif)', v13ListeDeroulante('v13-codif-existant', '— aucun —', v13ColonnesDe(codification.source), codification.colonneCodeExistant, ecrire('colonneCodeExistant')))}
                ${v13Reglage('Nomenclature', v13ListeDeroulante('v13-codif-nomenclature', '—', sources, codification.nomenclature, ecrire('nomenclature')))}
                ${v13Reglage('Colonne du code', v13ListeDeroulante('v13-codif-code', '—', v13ColonnesDe(codification.nomenclature), codification.colonneCode, ecrire('colonneCode')))}
                ${v13Reglage('Colonne du libellé de référence', v13ListeDeroulante('v13-codif-libelle-ref', '—', v13ColonnesDe(codification.nomenclature), codification.colonneLibelleRef, ecrire('colonneLibelleRef')))}
            </div>
            <h4 class="font-bold text-sm mb-1">Les niveaux de l'arbre, du plus haut au plus fin</h4>
            <p class="text-[11px] text-slate-500 mb-2">Famille, système, sous-système… c'est ce chemin qui accompagnera chaque code trouvé.</p>
            <div class="flex items-center gap-2 flex-wrap mb-3" id="v13-codif-niveaux">
                ${(codification.niveaux || [])
                    .map(
                        (niveau, rang) =>
                            `<span class="v13-paire">${escapeHTML(niveau)}
                                <button onclick="v13RetirerUnNiveau('${identifiant}', ${rang})" title="Retirer ce niveau">✕</button></span>`
                    )
                    .join('')}
                ${v13ListeDeroulante('v13-codif-niveau', '+ niveau…', v13ColonnesDe(codification.nomenclature), '', '')}
                <button onclick="v13AjouterUnNiveau('${identifiant}')" class="text-[11px] bg-indigo-50 border border-indigo-200 text-indigo-700 px-2 py-1 rounded font-bold hover:bg-indigo-100">Ajouter</button>
            </div>
            <h4 class="font-bold text-sm mb-1">Chercher dans la bonne branche</h4>
            <p class="text-[11px] text-slate-500 mb-2">Quand la famille est déjà connue dans la liste, on ne cherche que dans sa branche de l'arbre : c'est ce qui empêche de coder une vanne en pompe parce que les libellés se ressemblent.</p>
            <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
                ${v13Reglage('Colonne de la liste', v13ListeDeroulante('v13-codif-restreindre', '— ne pas restreindre —', v13ColonnesDe(codification.source), codification.restreindreSource, ecrire('restreindreSource')))}
                ${v13Reglage('doit correspondre à', v13ListeDeroulante('v13-codif-restreindre-ref', '—', v13ColonnesDe(codification.nomenclature), codification.restreindreNomenclature, ecrire('restreindreNomenclature')))}
                ${v13Reglage(
                    'Ressemblance',
                    `<select id="v13-codif-methode" onchange="${ecrire('methode')}" class="border border-slate-300 p-1.5 rounded text-xs bg-white w-full">${Object.keys(
                        V13_METHODES_DE_RESSEMBLANCE
                    )
                        .map(
                            cle =>
                                `<option value="${cle}" ${codification.methode === cle ? 'selected' : ''}>${escapeHTML(V13_METHODES_DE_RESSEMBLANCE[cle])}</option>`
                        )
                        .join('')}</select>`
                )}
                ${v13Reglage("Coder d'office au-dessus de", `<input id="v13-codif-seuil-auto" type="number" min="0" max="1" step="0.01" value="${Number(codification.seuilAuto)}" onchange="${ecrire('seuilAuto')}" class="border border-slate-300 p-1.5 rounded text-xs w-full">`)}
                ${v13Reglage('Proposer à la revue au-dessus de', `<input id="v13-codif-seuil-revoir" type="number" min="0" max="1" step="0.01" value="${Number(codification.seuilRevoir)}" onchange="${ecrire('seuilRevoir')}" class="border border-slate-300 p-1.5 rounded text-xs w-full">`)}
                ${v13Reglage('Propositions montrées', `<input id="v13-codif-propositions" type="number" min="1" max="${V13_PROPOSITIONS_MAXIMUM}" step="1" value="${v13CombienDePropositions(codification)}" onchange="${ecrire('propositions')}" class="border border-slate-300 p-1.5 rounded text-xs w-full" title="Combien de types de la famille de la ligne on propose à la revue. ${V13_CANDIDATS_ELARGIS} propositions prises ailleurs dans l’arbre viennent ensuite, jamais à la place.">`)}
            </div>`;
        }
        /** Une ligne de comparaison : ses deux colonnes, son poids et sa mesure. */
        function v13LigneDeComparaison(codification, comparaison, rang) {
            const identifiant = codification.id;
            const ecrire = champ => `v13EcrireDansLaComparaison('${identifiant}', '${comparaison.id}', '${champ}', this.value)`;
            const mesures = [['', 'celle de la codification']]
                .concat(Object.keys(V13_METHODES_DE_RESSEMBLANCE).map(cle => [cle, V13_METHODES_DE_RESSEMBLANCE[cle]]))
                .map(
                    mesure =>
                        `<option value="${mesure[0]}" ${comparaison.methode === mesure[0] ? 'selected' : ''}>${escapeHTML(mesure[1])}</option>`
                )
                .join('');
            const colonnes = (valeurs, courante) =>
                ['']
                    .concat(valeurs)
                    .map(
                        colonne =>
                            `<option value="${escapeHTML(colonne)}" ${courante === colonne ? 'selected' : ''}>${escapeHTML(colonne || '—')}</option>`
                    )
                    .join('');
            return `<tr class="v13-codif-comparaison" data-comparaison="${escapeHTML(comparaison.id)}">
                <td class="p-1.5"><select onchange="${ecrire('colonneSource')}" class="border border-slate-300 p-1 rounded text-xs bg-white w-full">${colonnes(v13ColonnesDe(codification.source), comparaison.colonneSource)}</select></td>
                <td class="p-1.5"><select onchange="${ecrire('colonneNomenclature')}" class="border border-slate-300 p-1 rounded text-xs bg-white w-full">${colonnes(v13ColonnesDe(codification.nomenclature), comparaison.colonneNomenclature)}</select></td>
                <td class="p-1.5"><input type="number" min="0.1" max="10" step="0.5" value="${Number(comparaison.poids) || 1}" onchange="${ecrire('poids')}" class="border border-slate-300 p-1 rounded text-xs w-16"></td>
                <td class="p-1.5"><select onchange="${ecrire('methode')}" class="border border-slate-300 p-1 rounded text-xs bg-white">${mesures}</select>
                    <div class="text-[11px] text-slate-500 v13-codif-phrase-comparaison">${escapeHTML(v13PhraseDeLaComparaison(comparaison))}</div></td>
                <td class="p-1.5"><button onclick="v13RetirerUneComparaison('${identifiant}', ${rang})" class="text-red-500 font-bold" title="Retirer">✕</button></td>
            </tr>`;
        }
        /** ② Ce que l'on compare, des deux côtés. */
        function v13BlocDesComparaisons(codification) {
            const lignes = (codification.comparaisons || [])
                .map((comparaison, rang) => v13LigneDeComparaison(codification, comparaison, rang))
                .join('');
            const vide = `<tr><td colspan="5" class="p-3 text-[11px] text-slate-400 italic">Rien de déclaré : on compare « ${escapeHTML(codification.colonneLibelle || 'le libellé')} » à « ${escapeHTML(codification.colonneLibelleRef || 'le libellé du type')} ».</td>
                </tr>`;
            return `<p class="text-[11px] text-slate-500 mb-2">Par défaut, le libellé de la liste contre le libellé de la nomenclature. Mais le rapprochement peut porter sur un tout autre attribut — une désignation technique contre un libellé de codification, une marque contre un fabricant — et sur plusieurs à la fois : le score est alors leur moyenne pondérée.</p>
            <table class="w-full text-left text-xs mb-2"><thead class="bg-slate-100 text-slate-600 font-bold">
                <tr><th class="p-1.5">Colonne de la liste</th>
                <th class="p-1.5">Colonne de la nomenclature</th>
                <th class="p-1.5">Poids</th>
                <th class="p-1.5">Mesure</th>
                <th></th>
                </tr>
            </thead>
                <tbody class="divide-y divide-slate-100">${lignes || vide}</tbody></table>
            <button onclick="v13AjouterUneComparaison('${codification.id}')" class="text-xs bg-white border border-slate-300 px-3 py-1.5 rounded-lg font-bold hover:bg-slate-50">+ Comparaison</button>`;
        }

        /** ③ Les mots qui en valent d'autres. */
        function v13BlocDesSynonymes(codification) {
            const identifiant = codification.id;
            const lignes = (codification.synonymes || [])
                .map((synonyme, rang) => {
                    const ecrire = champ =>
                        `v13EcrireDansLeSynonyme('${identifiant}', '${synonyme.id}', '${champ}', this.${champ === 'proche' ? 'checked' : 'value'})`;
                    return `<tr class="v13-codif-synonyme" data-synonyme="${escapeHTML(synonyme.id)}">
                        <td class="p-1.5"><input value="${escapeHTML(synonyme.motRetenu || '')}" onchange="${ecrire('motRetenu')}" class="border border-slate-300 p-1 rounded text-xs w-full" placeholder="POMPE"></td>
                        <td class="p-1.5"><input value="${escapeHTML(v13SaisieDesMots(synonyme.variantes))}" onchange="${ecrire('variantes')}" class="border border-slate-300 p-1 rounded text-xs w-full" placeholder="motopompe ; groupe motopompe">
                            <div class="text-[11px] text-slate-500 v13-codif-phrase-synonyme">${escapeHTML(v13PhraseDuSynonyme(synonyme))}</div></td>
                        <td class="p-1.5 text-center"><input type="checkbox" ${synonyme.proche ? 'checked' : ''} onchange="${ecrire('proche')}"></td>
                        <td class="p-1.5"><button onclick="v13RetirerUnSynonyme('${identifiant}', ${rang})" class="text-red-500 font-bold" title="Retirer">✕</button></td>
                    </tr>`;
                })
                .join('');
            const vide = `<tr><td colspan="4" class="p-3 text-[11px] text-slate-400 italic">Aucun synonyme : les libellés sont comparés tels qu'ils sont écrits.</td>
                </tr>`;
            return `<p class="text-[11px] text-slate-500 mb-2">Le jargon du site ne ressemble pas toujours à la nomenclature. Déclarez ici qu'une motopompe est une pompe, qu'une électrovanne est une vanne, que « centrif » veut dire « centrifuge » : les variantes sont ramenées au mot retenu des deux côtés avant de comparer. Les règles de mots-clés, elles, restent littérales.</p>
            <table class="w-full text-left text-xs mb-2"><thead class="bg-slate-100 text-slate-600 font-bold">
                <tr><th class="p-1.5">Mot retenu</th>
                <th class="p-1.5">Autres façons de l'écrire</th>
                <th class="p-1.5">Même mal écrit</th>
                <th></th>
                </tr>
            </thead>
                <tbody class="divide-y divide-slate-100">${lignes || vide}</tbody></table>
            <button onclick="v13AjouterUnSynonyme('${identifiant}')" class="text-xs bg-white border border-slate-300 px-3 py-1.5 rounded-lg font-bold hover:bg-slate-50">+ Synonyme</button>`;
        }

        /** ④ Les règles, de la plus sûre à la plus souple. */
        function v13BlocDesRegles(codification) {
            const identifiant = codification.id;
            const lignes = (codification.regles || [])
                .map((regle, rang) => v13LigneDeRegle(codification, regle, rang))
                .join('');
            const vide = `<tr><td colspan="4" class="p-3 text-[11px] text-slate-400 italic">Aucune règle : seules la correspondance et la ressemblance joueront.</td>
                </tr>`;
            return `<p class="text-[11px] text-slate-500 mb-2">La première qui répond gagne. Le code déjà fourni passe avant tout, puis la table de correspondance (${(codification.correspondances || []).length} libellé(s) appris), puis ces règles, puis la ressemblance.</p>
            <table class="w-full text-left text-xs mb-2"><thead class="bg-slate-100 text-slate-600 font-bold">
                <tr><th class="p-1.5"></th>
                <th class="p-1.5">La règle, en français</th>
                <th class="p-1.5">Code</th>
                <th></th>
                </tr>
            </thead>
                <tbody class="divide-y divide-slate-100">${lignes || vide}</tbody></table>
            <div class="flex items-center gap-2">
                <button onclick="v13AjouterUneRegle('${identifiant}')" class="text-xs bg-white border border-slate-300 px-3 py-1.5 rounded-lg font-bold hover:bg-slate-50">+ Règle</button>
                <button id="v13-codif-coder" onclick="v13CoderLaListe('${identifiant}')" ${v13Codification.enCours ? 'disabled' : ''} class="text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-1.5 rounded-lg">${v13Codification.enCours ? 'Codification…' : '▶ Coder la liste'}</button>
            </div>`;
        }
        /** Une règle : sa phrase en clair, puis les champs qui la composent. */
        function v13LigneDeRegle(codification, regle, rang) {
            const identifiant = codification.id;
            const ecrire = (champ, propriete) =>
                `v13EcrireDansLaRegle('${identifiant}', '${regle.id}', '${champ}', this.${propriete || 'value'})`;
            const types = Object.keys(V13_TYPES_DE_REGLE)
                .map(
                    cle =>
                        `<option value="${cle}" ${regle.type === cle ? 'selected' : ''}>${escapeHTML(V13_TYPES_DE_REGLE[cle])}</option>`
                )
                .join('');
            const colonnes = ['']
                .concat(v13ColonnesDe(codification.source))
                .map(
                    colonne =>
                        `<option value="${escapeHTML(colonne)}" ${regle.colonne === colonne ? 'selected' : ''}>${escapeHTML(colonne || 'le libellé')}</option>`
                )
                .join('');
            const champsDesMots =
                regle.type === 'expression'
                    ? `<input value="${escapeHTML(regle.motif || '')}" onchange="${ecrire('motif')}" class="border border-slate-300 p-1 rounded text-xs flex-grow" placeholder="expression régulière">`
                    : `<input value="${escapeHTML(v13SaisieDesMots(regle.contient))}" onchange="${ecrire('contient')}" class="border border-slate-300 p-1 rounded text-xs flex-grow" placeholder="contient : pompe ; centrifuge">
                       <label class="flex items-center gap-1 text-[11px]"><input type="checkbox" ${regle.ou ? 'checked' : ''} onchange="${ecrire('ou', 'checked')}"> un seul suffit</label>
                       <input value="${escapeHTML(v13SaisieDesMots(regle.sauf))}" onchange="${ecrire('sauf')}" class="border border-slate-300 p-1 rounded text-xs flex-grow" placeholder="mais pas : vide">`;
            return `<tr class="v13-codif-regle" data-regle="${escapeHTML(regle.id)}">
                <td class="p-1.5"><input type="checkbox" ${regle.actif ? 'checked' : ''} onchange="${ecrire('actif', 'checked')}"></td>
                <td class="p-1.5">
                    <div class="font-bold mb-1 v13-codif-phrase-regle">${escapeHTML(v13PhraseDeLaRegle(regle, codification.colonneLibelle))}</div>
                    <div class="flex items-center gap-1.5 flex-wrap">
                        <select onchange="${ecrire('type')}" class="border border-slate-300 p-1 rounded text-xs bg-white">${types}</select>
                        <select onchange="${ecrire('colonne')}" class="border border-slate-300 p-1 rounded text-xs bg-white">${colonnes}</select>
                        ${champsDesMots}
                    </div>
                </td>
                <td class="p-1.5"><input value="${escapeHTML(regle.code || '')}" onchange="${ecrire('code')}" class="border border-slate-300 p-1 rounded text-xs w-24"></td>
                <td class="p-1.5 whitespace-nowrap">
                    <button onclick="v13MonterLaRegle('${identifiant}', ${rang})" class="text-slate-500 font-bold" title="Monter">↑</button>
                    <button onclick="v13RetirerUneRegle('${identifiant}', ${rang})" class="text-red-500 font-bold ml-1" title="Retirer">✕</button>
                </td>
            </tr>`;
        }

        /** ⑤ Le résultat : le bilan en chiffres, puis les lignes codées. */
        /**
         * Le récapitulatif des choix, toujours visible. Les réglages sont nombreux et répartis en quatre
         * blocs ; sans ce rappel, on ne sait plus ce que l’on a paramétré sans tout rouvrir.
         */
        function v13BlocDuRecapitulatif(codification) {
            const lignes = v13RecapDeLaCodification(codification)
                .map(
                    ligne => `<div class="flex gap-2 text-[11px] leading-5">
                        <span class="font-bold text-slate-500 shrink-0 w-40">${escapeHTML(ligne.intitule)}</span>
                        <span class="text-slate-700">${escapeHTML(ligne.valeur)}</span>
                    </div>`
                )
                .join('');
            return `<div class="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-3" id="v13-codif-recap">
                <div class="text-[10px] uppercase font-bold text-slate-400 mb-1.5">Ce que fait cette codification</div>
                ${lignes}
            </div>`;
        }
        /**
         * TOUS les cas à revoir, avec leurs propositions, envoyés vers un jeu temporaire.
         *
         * L’écran ne montre que les cinquante libellés les plus fréquents : c’est ce qu’on peut trancher à
         * la main sans se perdre. Mais pour juger de l’ensemble — combien de libellés restent, lesquels
         * n’ont aucune proposition de leur famille, où sont les gros volumes — il faut la vue complète,
         * dans un tableur. Une ligne par proposition, avec le libellé, sa famille, le nombre de lignes
         * qu’il couvre, le code proposé, son chemin, son score, et s’il vient de la bonne famille.
         */
        async function v13ExporterLesCasARevoir(identifiant) {
            const codification = v13CodificationParIdentifiant(identifiant);
            if (!codification || !v13Codification.resultat) return;
            bgTaskStart('Préparation de tous les cas à revoir');
            try {
                const jeu = await v12TmpFromSql(
                    v13SqlDesCasARevoir(codification, 0, V13_TABLE_CODEE),
                    `${codification.source} à revoir`,
                    {
                        kind: 'extract',
                        origin: `Codification « ${codification.nom} » — tous les cas à revoir`,
                        from: [codification.source, codification.nomenclature]
                    }
                );
                bgTaskEnd(`🔎 ${Number(jeu.rows || 0).toLocaleString('fr-FR')} proposition(s) à examiner.`);
            } catch (erreur) {
                bgTaskEnd();
                showError('Impossible de préparer les cas à revoir : ' + v13PhraseDeLErreur(erreur));
            }
        }

        /**
         * Le résultat envoyé vers un jeu temporaire : de là il s’extrait, s’exporte en CSV, s’audite, et peut
         * être promu en vraie source. On ne recode rien : la table codée est déjà là.
         */
        async function v13UtiliserLeResultat(identifiant) {
            const codification = v13CodificationParIdentifiant(identifiant);
            if (!codification || !v13Codification.resultat) return;
            bgTaskStart('Préparation du résultat codé');
            try {
                await v12TmpFromSql(
                    `SELECT * EXCLUDE (__rn) FROM ${sqlIdent(V13_TABLE_CODEE)}`,
                    `${codification.source} codé`,
                    {
                        kind: 'extract',
                        origin: `Codification « ${codification.nom} »`,
                        from: [codification.source, codification.nomenclature]
                    }
                );
                bgTaskEnd();
            } catch (erreur) {
                bgTaskEnd();
                showError('Impossible de préparer le résultat : ' + v13PhraseDeLErreur(erreur));
            }
        }

        function v13BlocDuResultat(codification) {
            const resultat = v13Codification.resultat;
            if (!resultat) return '';
            const bilan = resultat.bilan;
            const chiffre = (intitule, valeur, couleur) =>
                `<div class="bg-white border border-slate-200 rounded-lg px-3 py-2"><div class="text-[10px] uppercase font-bold text-slate-400">${escapeHTML(intitule)}</div>
                    <div class="text-xl font-black ${couleur || ''}">${escapeHTML(String(valeur))}</div>
                    </div>`;
            const colonnes = resultat.lignes.length ? Object.keys(resultat.lignes[0]) : [];
            const enTetes = {
                __code: 'Code trouvé',
                __origine: 'Par quoi',
                __score: 'Confiance',
                __statut: 'Statut',
                __chemin: "Chemin dans l'arbre",
                __code_propose: 'Proposition dans sa famille',
                __libelle_propose: 'Libellé de cette proposition',
                __score_propose: 'Confiance de cette proposition',
                __code_autre_branche: 'Code en cause, ou trouvé hors famille',
                __libelle_autre_branche: 'Libellé de ce code',
                __chemin_autre_branche: "Chemin dans l'arbre de ce code",
                __branche_trouvee: 'Familles où ce code existe'
            };
            const corps = resultat.lignes
                .map(
                    ligne =>
                        `<tr class="v13-codif-ligne">${colonnes
                            .map(
                                colonne =>
                                    `<td class="p-1.5 whitespace-nowrap ${v13ClasseDeLaCellule(colonne, ligne[colonne])}">${escapeHTML(v13CelluleLisible(codification, colonne, ligne[colonne]))}</td>`
                            )
                            .join('')}</tr>`
                )
                .join('');
            return `<div class="grid grid-cols-2 md:grid-cols-6 gap-2 mb-2" id="v13-codif-chiffres">
                ${chiffre("Codées d'office", bilan.office, 'text-emerald-600')}
                ${chiffre('À revoir', bilan.revoir, 'text-amber-600')}
                ${chiffre('Autre branche', bilan.branche || 0, 'text-violet-600')}
                ${chiffre('Proposition faible', bilan.faible || 0, 'text-sky-600')}
                ${chiffre('Non trouvées', bilan.absent, '')}
                ${chiffre('Couverture', Math.round(100 * bilan.couverture) + ' %', '')}
            </div>
            <p class="text-[11px] text-slate-500 mb-1" id="v13-codif-phrase-bilan">${escapeHTML(bilan.phrase)}</p>
            <p class="text-[11px] mb-2 ${resultat.lignesEnEntree && resultat.lignesEnEntree !== bilan.total ? 'text-red-600 font-bold' : 'text-slate-500'}" id="v13-codif-decompte">${escapeHTML(v13PhraseDuDecompte(resultat.lignesEnEntree, bilan.total))}</p>
            <div class="flex items-center gap-2 mb-2 flex-wrap">
                <button id="v13-codif-utiliser" onclick="v13UtiliserLeResultat('${codification.id}')" class="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-1.5 rounded-lg" title="Le résultat devient un jeu utilisable dans Extraire, Comparer, Qualité — et promouvable en source">→ Utiliser le résultat</button>
                ${bilan.revoir + (bilan.branche || 0) + (bilan.faible || 0) ? `<button id="v13-codif-exporter-revue" onclick="v13ExporterLesCasARevoir('${codification.id}')" class="text-xs bg-white border border-indigo-300 text-indigo-700 font-bold px-3 py-1.5 rounded-lg" title="Tous les libellés à trancher, avec leurs propositions — sans le plafond de l’écran">→ Tous les cas à revoir</button>` : ''}
                <span class="text-[10px] text-slate-400">Les ${escapeHTML(Number(bilan.total).toLocaleString('fr-FR'))} lignes codées partent dans un jeu — <b>toutes</b>, sans plafond : de là, vous pouvez les extraire, les exporter en CSV, ou en faire une vraie source. Le tableau ci-dessous n’en montre que ${V13_LIGNES_MONTREES}.</span>
            </div>
            ${v13AlerteDeLaBranche()}
            ${v13ExplicationDesDesaccords(codification, resultat)}
            <div class="overflow-x-auto border border-slate-200 rounded-lg" id="v13-codif-resultat">
                <table class="w-full text-left text-[11px]"><thead class="bg-slate-100 text-slate-600 font-bold"><tr>
                    ${colonnes.map(colonne => `<th class="p-1.5 whitespace-nowrap">${escapeHTML(enTetes[colonne] || colonne)}</th>`).join('')}
                </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">${corps}</tbody></table>
            </div>`;
        }
        /**
         * Pourquoi ce cas n’a reçu aucune proposition de sa famille. Deux raisons possibles, et il vaut
         * mieux savoir laquelle : ou bien cette famille n’existe pas dans la nomenclature — c’est alors la
         * colonne de branche qu’il faut revoir —, ou bien elle existe mais aucun de ses types ne partage de
         * mot avec ce libellé — et c’est le libellé ou les synonymes qu’il faut reprendre.
         */
        function v13PourquoiAucuneDansLaFamille(unCas, dansLaFamille) {
            if (dansLaFamille || !unCas.famille) return '';
            const controle = v13Codification.branche;
            const connue = controle && (controle.familles || []).includes(unCas.famille);
            if (controle && !connue) return `La famille « ${unCas.famille} » de cette ligne n’existe pas dans la nomenclature.`;
            return `La famille « ${unCas.famille} » existe dans la nomenclature, mais aucun de ses types ne partage de mot avec ce libellé.`;
        }
        /** Les deux essais de colonnes, côté nomenclature puis côté liste, rendus en phrases. */
        async function v13ConseilsDesColonnes(codification, conn) {
            const essais = [
                {
                    cote: 'nomenclature',
                    declaree: codification.restreindreNomenclature,
                    fichier: `« ${codification.nomenclature} »`
                },
                { cote: 'liste', declaree: codification.restreindreSource, fichier: `« ${codification.source} »` }
            ];
            const phrases = [];
            for (const essai of essais) {
                const sql = v13SqlDesColonnesDeBranche(codification, essai.cote);
                if (!sql) continue;
                try {
                    const phrase = v13ConseilDeColonne(
                        arrowResultToObjects(await conn.query(sql)),
                        essai.declaree,
                        essai.fichier
                    );
                    if (phrase) phrases.push(phrase);
                } catch (erreur) {
                    console.warn('Essai des colonnes de branche ignoré :', erreur);
                }
            }
            return phrases;
        }
        /**
         * L’alerte sur la colonne de branche. Quand une famille de la liste n’existe pas dans la
         * nomenclature, aucune ligne de cette famille ne peut recevoir de proposition — et rien ne le disait.
         */
        function v13AlerteDeLaBranche() {
            const controle = v13Codification.branche;
            if (!controle || controle.accord || !controle.phrase) return '';
            return `<div class="bg-amber-50 border border-amber-300 rounded-lg p-3 mb-2 text-[11px] text-amber-900" id="v13-codif-alerte-branche">
                <div class="font-bold mb-1">⚠️ La colonne de branche ne correspond pas des deux côtés</div>
                ${escapeHTML(controle.phrase)}
                ${(controle.conseils || []).map(phrase => `<div class="mt-1 font-bold">${escapeHTML(phrase)}</div>`).join('')}
            </div>`;
        }
        /**
         * Les lignes rangées en « autre branche », expliquées en français sous le tableau. Le statut seul ne
         * suffit pas : il faut dire d’où vient le code et où ce code existe vraiment.
         */
        function v13ExplicationDesDesaccords(codification, resultat) {
            const fautives = (resultat.lignes || []).filter(ligne => ligne.__statut === 'branche').slice(0, 5);
            if (!fautives.length) return '';
            const phrases = fautives.map(ligne => `<li>${escapeHTML(v13PhraseDuDesaccord(ligne, codification))}</li>`).join('');
            return `<div class="bg-violet-50 border border-violet-200 rounded-lg p-3 mb-2 text-[11px] text-violet-900" id="v13-codif-desaccords">
                <div class="font-bold mb-1">La famille de la ligne et l’arbre ne disent pas la même chose</div>
                <ul class="list-disc pl-4 space-y-0.5">${phrases}</ul>
            </div>`;
        }
        /** La valeur d'une cellule, traduite quand elle est technique. */
        function v13CelluleLisible(codification, colonne, valeur) {
            if (valeur === null || valeur === undefined) return '';
            if (colonne === '__statut')
                return (
                    {
                        office: "Codé d'office",
                        revoir: 'À revoir',
                        branche: 'Autre branche',
                        faible: 'Proposition faible',
                        absent: 'Non trouvé'
                    }[valeur] || String(valeur)
                );
            if (colonne === '__origine') return v13PhraseDeLOrigine(valeur, codification.regles);
            if (colonne === '__score') return Math.round(100 * (Number(valeur) || 0)) + ' %';
            return String(valeur);
        }
        /** La couleur d'une cellule de statut : l'œil trie avant de lire. */
        function v13ClasseDeLaCellule(colonne, valeur) {
            if (colonne !== '__statut') return '';
            if (valeur === 'office') return 'text-emerald-600 font-bold';
            if (valeur === 'revoir') return 'text-amber-600 font-bold';
            if (valeur === 'branche') return 'text-violet-600 font-bold';
            if (valeur === 'faible') return 'text-sky-600 font-bold';
            return 'text-slate-500';
        }

        /** ⑥ À revoir : chaque cas douteux avec ses meilleures propositions. */
        function v13BlocDeLaRevue(codification) {
            if (!v13Codification.casARevoir.length) return '';
            const cas = v13Codification.casARevoir
                .map(unCas => {
                    const pourTous = `'${codification.id}', ${unCas.rang}, ${JSON.stringify(unCas.libelle).replace(/"/g, '&quot;')}`;
                    const propositions = unCas.candidats
                        .map(
                            candidat =>
                                `<button onclick="v13TrancherLeCas(${pourTous}, ${JSON.stringify(candidat.code).replace(/"/g, '&quot;')}, ${unCas.combien || 1})" class="v13-codif-candidat${candidat.memeBranche ? '' : ' hors-branche'}">
                                    <b>${escapeHTML(candidat.code)}</b>
                                    <span class="chemin">${escapeHTML(candidat.chemin)}${candidat.memeBranche ? '' : ' — autre branche'}</span>
                                    <span class="score">${Math.round(100 * candidat.score)} %</span>
                                </button>`
                        )
                        .join('');
                    const dansLaFamille = unCas.candidats.filter(candidat => candidat.memeBranche).length;
                    const elargies = unCas.candidats.length - dansLaFamille;
                    const lignes = Number(unCas.combien) || 1;
                    const combienDit =
                        lignes > 1
                            ? `<span class="v13-codif-combien" title="Votre choix codera ces ${lignes} lignes d’un seul coup">${lignes.toLocaleString('fr-FR')} lignes portent ce libellé</span>`
                            : '<span class="v13-codif-combien">1 ligne</span>';
                    return `<div class="v13-codif-cas" data-rang="${unCas.rang}" data-combien="${lignes}">
                        <div class="font-bold mb-1">${escapeHTML(unCas.libelle)} ${combienDit}</div>
                        ${elargies ? `<div class="text-[10px] text-slate-400 mb-1">${dansLaFamille} proposition(s) dans la famille de la ligne, puis ${elargies} prise(s) ailleurs dans l’arbre. ${escapeHTML(v13PourquoiAucuneDansLaFamille(unCas, dansLaFamille))}</div>` : ''}
                        <div class="flex gap-2 flex-wrap">${propositions}
                            <button onclick="v13TrancherLeCas(${pourTous}, '', ${lignes})" class="text-xs bg-white border border-slate-300 px-3 py-1.5 rounded-lg font-bold hover:bg-slate-50" title="Ce libellé ne sera plus reproposé">aucun ne convient</button>
                        </div>
                    </div>`;
                })
                .join('');
            const total = v13Codification.casARevoir.reduce((somme, unCas) => somme + (Number(unCas.combien) || 1), 0);
            const plafond =
                v13Codification.casARevoir.length >= V13_CAS_MONTRES
                    ? ` L’écran s’arrête à ${V13_CAS_MONTRES} questions : « → Tous les cas à revoir », plus haut, les sort tous.`
                    : '';
            return `<p class="text-[11px] text-slate-500 mb-2">Une question par libellé, les plus fréquents d’abord : ces ${v13Codification.casARevoir.length} décisions couvrent ${total.toLocaleString('fr-FR')} ligne(s).${plafond} Chaque décision descend dans la table de correspondance — à la prochaine livraison, ce libellé sera codé tout seul.</p>${cas}`;
        }

        /** Un bloc de l'écran : son titre numéroté, et son contenu. */
        function v13BlocDeCodification(titre, contenu) {
            return `<div class="bg-white rounded-xl border border-slate-200 p-4 mb-4">
                <h3 class="font-bold text-slate-800 mb-2">${escapeHTML(titre)}</h3>${contenu}</div>`;
        }
        /** Rend l'écran entier : le choix de la codification, ses cinq blocs, et la prochaine chose à faire. */
        function renderCodification() {
            const zone = el('step-' + V13_ECRAN_CODIFICATION);
            if (!zone) return;
            const codifications = v13Codifications();
            if (!v13CodificationOuverte() && codifications.length) v13Codification.ouverte = codifications[0].id;
            const codification = v13CodificationOuverte();
            const choix = codifications
                .map(
                    candidate =>
                        `<option value="${escapeHTML(candidate.id)}" ${candidate.id === v13Codification.ouverte ? 'selected' : ''}>${escapeHTML(candidate.nom)}</option>`
                )
                .join('');
            const entete = `<div class="flex items-center justify-between gap-3 mb-4 flex-wrap">
                <div>
                    <h2 class="text-xl font-black text-slate-800">Codification</h2>
                    <p class="text-xs text-slate-500">Retrouvez, pour chaque ligne d'une liste reçue, le code de votre référentiel — par le code déjà fourni, par la table de correspondance, par des règles de mots-clés, puis par la ressemblance du libellé.</p>
                </div>
                <div class="flex items-center gap-2">
                    <select id="v13-codif-choisie" onchange="v13OuvrirLaCodification(this.value)" class="border border-slate-300 p-1.5 rounded text-xs bg-white">${choix || '<option value="">— aucune —</option>'}</select>
                    <button id="v13-codif-nouvelle" onclick="v13AjouterUneCodification()" class="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-1.5 rounded-lg">+ Nouvelle codification</button>
                    ${codification ? `<button onclick="v13SupprimerLaCodification('${codification.id}')" class="text-xs bg-red-50 border border-red-200 text-red-600 px-3 py-1.5 rounded-lg font-bold">Supprimer</button>` : ''}
                </div>
            </div>`;
            if (!codification) {
                zone.innerHTML =
                    entete + `<p class="p-6 text-center text-slate-400 italic">Aucune codification pour le moment.</p>`;
                return;
            }
            zone.innerHTML =
                entete +
                `<input id="v13-codif-nom" value="${escapeHTML(codification.nom)}" onchange="v13EcrireDansLaCodification('nom', this.value)" class="border border-slate-300 p-1.5 rounded text-sm font-bold mb-3 w-full max-w-md">
                <p class="text-[11px] text-slate-500 mb-3" id="v13-codif-prochaine">${escapeHTML(v13ProchaineAction((v13Codification.resultat || {}).bilan))}</p>` +
                v13BlocDuRecapitulatif(codification) +
                v13BlocDeCodification('① La liste à coder, et la nomenclature de référence', v13BlocDesSources(codification)) +
                v13BlocDeCodification("② Ce que l'on compare", v13BlocDesComparaisons(codification)) +
                v13BlocDeCodification("③ Les mots qui en valent d'autres", v13BlocDesSynonymes(codification)) +
                v13BlocDeCodification('④ Les règles, de la plus sûre à la plus souple', v13BlocDesRegles(codification)) +
                (v13Codification.resultat ? v13BlocDeCodification('⑤ Le résultat', v13BlocDuResultat(codification)) : '') +
                (v13Codification.casARevoir.length
                    ? v13BlocDeCodification(
                          `⑥ À revoir — ${v13Codification.casARevoir.length} cas`,
                          v13BlocDeLaRevue(codification)
                      )
                    : '');
        }

        /**
         * L'écran 17 n'existe pas dans la page livrée : on le crée à côté des seize autres, et l'on enrichit
         * « switchTab » pour qu'il le cache comme les autres et le rende quand on y vient.
         */
        function v13PoserLEcranDeCodification() {
            if (el('step-' + V13_ECRAN_CODIFICATION)) return;
            const voisin = el('step-16') || el('step-1');
            if (!voisin || !voisin.parentNode) return;
            const section = document.createElement('div');
            section.id = 'step-' + V13_ECRAN_CODIFICATION;
            section.className = 'animate-fade-in hidden';
            voisin.parentNode.appendChild(section);
            const exploitation = NAV_PHASES.find(phase => phase.id === 'etl');
            if (exploitation && !exploitation.tabs.some(onglet => onglet.n === V13_ECRAN_CODIFICATION))
                exploitation.tabs.splice(2, 0, { n: V13_ECRAN_CODIFICATION, icon: '🏷️', label: 'Codification' });
        }
        Studio.extend(
            'switchTab',
            base =>
                function (num) {
                    v13PoserLEcranDeCodification();
                    base(num);
                    const section = el('step-' + V13_ECRAN_CODIFICATION);
                    if (!section) return;
                    section.classList.toggle('hidden', num !== V13_ECRAN_CODIFICATION);
                    if (num === V13_ECRAN_CODIFICATION) renderCodification();
                }
        );
        // La section doit exister avant le premier rendu du menu, sans quoi l'onglet n'apparaît pas.
        Studio.extend(
            'renderNav',
            base =>
                function () {
                    v13PoserLEcranDeCodification();
                    return base.apply(null, arguments);
                }
        );
