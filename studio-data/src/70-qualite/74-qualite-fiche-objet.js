        // ======================= FICHE DE QUALITÉ D'UN OBJET MÉTIER =======================
        // Une synthèse courte, lisible par n'importe qui : quelques taux, une note
        // d'ensemble, et ce qu'il faut corriger en premier. Rien n'est réinventé ici :
        // les règles, les doublons et la check-list de gouvernance sont ceux de l'audit.

        // Au-dessus, c'est bon ; entre les deux, à surveiller ; en dessous, à corriger.
        const FQ_SEUIL_BON = 90;
        const FQ_SEUIL_MOYEN = 70;
        // Une liste de points faibles plus longue que ça ne se lit plus.
        const FQ_POINTS_MONTRES = 5;
        // La dernière fiche calculée, gardée pour l'export.
        let fqDerniereFiche = null;

        function fqCouleur(taux) {
            if (taux === null || taux === undefined) return 'text-slate-400';
            return taux >= FQ_SEUIL_BON ? 'text-emerald-600' : taux >= FQ_SEUIL_MOYEN ? 'text-amber-600' : 'text-red-600';
        }
        function fqTaux(part, total) {
            return total > 0 ? Math.round((part / total) * 1000) / 10 : null;
        }
        function fqAffiche(taux) {
            return taux === null || taux === undefined ? '—' : String(taux).replace('.', ',') + ' %';
        }
        function fqNombre(n) {
            return Number(n || 0).toLocaleString('fr-FR');
        }

        // ---- 1. Complétude des informations -------------------------------------
        // Pour chaque information rattachée à une colonne, la part des lignes remplies.
        // Une case vide ou ne contenant que des espaces compte comme non remplie.
        async function fqCompletude(bo, conn) {
            const parColonne = new Map();
            boAllAttrRows(bo).forEach(r => {
                (r.el.mappings || []).forEach(m => {
                    if (!m.table || !m.col || !tableByName(m.table)) return;
                    const cle = m.table + '|' + m.col;
                    if (!parColonne.has(cle))
                        parColonne.set(cle, { nom: r.el.name, table: m.table, col: m.col, lignes: 0, remplies: 0 });
                });
            });
            const details = [...parColonne.values()];
            if (!details.length) return { taux: null, details: [], raison: 'Aucune information rattachée à une colonne.' };
            // Une requête par table : toutes ses colonnes comptées d'un coup.
            const tables = [...new Set(details.map(d => d.table))];
            for (const nom of tables) {
                const table = tableByName(nom);
                const siennes = details.filter(d => d.table === nom);
                const ou = boSourceWhere(bo, nom);
                const comptes = siennes
                    .map(
                        (d, i) =>
                            `COUNT(*) FILTER (WHERE ${sqlIdent(d.col)} IS NOT NULL AND TRIM(CAST(${sqlIdent(d.col)} AS VARCHAR)) <> '')::BIGINT AS c${i}`
                    )
                    .join(', ');
                const res = await conn.query(`SELECT COUNT(*)::BIGINT AS lignes, ${comptes}
                    FROM ${sqlIdent(duckTableName(table.id))}${ou ? ' WHERE ' + ou : ''}`);
                const ligne = arrowResultToObjects(res)[0];
                siennes.forEach((d, i) => {
                    d.lignes = Number(ligne.lignes);
                    d.remplies = Number(ligne['c' + i]);
                    d.taux = fqTaux(d.remplies, d.lignes);
                });
            }
            const lignes = details.reduce((somme, d) => somme + d.lignes, 0);
            const remplies = details.reduce((somme, d) => somme + d.remplies, 0);
            return { taux: fqTaux(remplies, lignes), details: details, lignes: lignes, remplies: remplies };
        }

        // ---- 2. Conformité aux règles -------------------------------------------
        // Les règles métier du périmètre ET les règles de qualité rattachées : pour
        // chacune, combien de cas contrôlés et combien en défaut.
        async function fqConformite(bo, conn) {
            const objTables = new Set(boPerimeterTableNames(bo));
            const metier = (state.governance.rules || []).filter(
                r => objTables.has(r.parentTable) || objTables.has(r.childTable)
            );
            const qualite = boQualityRules(bo).filter(r => r.enabled !== false);
            const details = [];
            for (const regle of metier) {
                try {
                    const res = await auditBusinessRule(regle);
                    details.push({
                        nom: regle.name || regle.parentTable + ' → ' + regle.childTable,
                        genre: 'métier',
                        controles: res.total,
                        defauts: res.viol,
                        taux: fqTaux(res.total - res.viol, res.total)
                    });
                } catch (e) {
                    details.push({ nom: regle.name || 'Règle métier', genre: 'métier', erreur: e.message });
                }
            }
            for (const regle of qualite) {
                try {
                    const res = await qrEvalRule(regle, conn);
                    if (!res || !res.ran) continue;
                    details.push({
                        nom: regle.name || 'Règle de qualité',
                        genre: 'qualité',
                        controles: res.total,
                        defauts: res.fails,
                        taux: fqTaux(res.total - res.fails, res.total)
                    });
                } catch (e) {
                    details.push({ nom: regle.name || 'Règle de qualité', genre: 'qualité', erreur: e.message });
                }
            }
            const comptes = details.filter(d => !d.erreur);
            const controles = comptes.reduce((somme, d) => somme + d.controles, 0);
            const defauts = comptes.reduce((somme, d) => somme + d.defauts, 0);
            return {
                taux: fqTaux(controles - defauts, controles),
                details: details,
                controles: controles,
                defauts: defauts,
                enDefaut: comptes.filter(d => d.defauts > 0).length,
                raison: details.length ? '' : 'Aucune règle ne porte sur cet objet.'
            };
        }

        // ---- 3. Doublons ---------------------------------------------------------
        // Technique : deux lignes rigoureusement identiques, colonne par colonne — il
        // n'y a aucune raison de les garder toutes les deux.
        async function fqDoublonsTechniques(bo, conn) {
            const table = boMasterTable(bo);
            if (!table) return { taux: null, raison: 'Aucune source maître désignée.' };
            const colonnes = (table.headers || []).map(sqlIdent);
            if (!colonnes.length) return { taux: null, raison: 'Colonnes inconnues.' };
            const ou = boSourceWhere(bo, table.name);
            const res = await conn.query(`WITH g AS (
                    SELECT COUNT(*)::BIGINT AS n FROM ${sqlIdent(duckTableName(table.id))}${ou ? ' WHERE ' + ou : ''}
                    GROUP BY ${colonnes.join(', ')})
                SELECT COALESCE(SUM(n), 0)::BIGINT AS lignes,
                       COALESCE(SUM(CASE WHEN n > 1 THEN n - 1 ELSE 0 END), 0)::BIGINT AS enTrop,
                       COUNT(*) FILTER (WHERE n > 1)::BIGINT AS groupes FROM g`);
            const ligne = arrowResultToObjects(res)[0];
            const lignes = Number(ligne.lignes),
                enTrop = Number(ligne.enTrop);
            return {
                taux: fqTaux(enTrop, lignes),
                lignes: lignes,
                enTrop: enTrop,
                groupes: Number(ligne.groupes),
                table: table.name
            };
        }
        // Fonctionnelle : deux lignes différentes qui désignent la même chose, d'après
        // la clé fonctionnelle déclarée. Sans clé déclarée, la question n'a pas de sens.
        async function fqDoublonsFonctionnels(bo, conn) {
            const table = boMasterTable(bo);
            if (!table) return { taux: null, raison: 'Aucune source maître désignée.' };
            const profils = (getKeyProfiles(table.name) || []).filter(p => (p.parts || []).length);
            if (!profils.length)
                return {
                    taux: null,
                    raison:
                        'Aucune clé fonctionnelle déclarée pour « ' +
                        table.name +
                        ' ». Déclarez-la dans Qualité › Doublons pour mesurer ce taux.'
                };
            let lignes = 0,
                enTrop = 0,
                groupes = 0;
            for (const profil of profils) {
                const source = buildDupSrcSql(table.id, profil.parts, '', 'keys', profil);
                const res = await conn.query(`WITH s AS (${source}),
                    g AS (SELECT ke, COUNT(*)::BIGINT AS n FROM s WHERE ke IS NOT NULL AND ke <> '' GROUP BY 1)
                    SELECT COALESCE(SUM(n), 0)::BIGINT AS lignes,
                           COALESCE(SUM(CASE WHEN n > 1 THEN n - 1 ELSE 0 END), 0)::BIGINT AS enTrop,
                           COUNT(*) FILTER (WHERE n > 1)::BIGINT AS groupes FROM g`);
                const ligne = arrowResultToObjects(res)[0];
                lignes += Number(ligne.lignes);
                enTrop += Number(ligne.enTrop);
                groupes += Number(ligne.groupes);
            }
            return {
                taux: fqTaux(enTrop, lignes),
                lignes: lignes,
                enTrop: enTrop,
                groupes: groupes,
                table: table.name,
                profils: profils.length
            };
        }

        // ---- 4. Ce qui est décrit, et ce qui est branché --------------------------
        function fqDescription(bo) {
            const rangs = boAllAttrRows(bo);
            const decrites = rangs.filter(r => (r.el.definition || '').trim()).length;
            const branchees = rangs.filter(r => (r.el.mappings || []).length).length;
            return {
                total: rangs.length,
                decrites: decrites,
                branchees: branchees,
                tauxDecrites: fqTaux(decrites, rangs.length),
                tauxBranchees: fqTaux(branchees, rangs.length),
                sansDefinition: rangs.filter(r => !(r.el.definition || '').trim()).map(r => r.el.name),
                sansColonne: rangs.filter(r => !(r.el.mappings || []).length).map(r => r.el.name)
            };
        }

        // ---- La fiche ------------------------------------------------------------
        // Les indicateurs, dans l'ordre où on les lit. « inverse » marque ceux dont un
        // taux ÉLEVÉ est une mauvaise nouvelle (les doublons) : la note les retourne.
        function fqIndicateurs(mesures) {
            return [
                {
                    cle: 'completude',
                    nom: 'Complétude des informations',
                    taux: mesures.completude.taux,
                    phrase:
                        mesures.completude.raison ||
                        fqNombre(mesures.completude.remplies) + ' cases remplies sur ' + fqNombre(mesures.completude.lignes),
                    ou: 'Onglet 🧩 Informations : rattachez les informations manquantes à une colonne.'
                },
                {
                    cle: 'regles',
                    nom: 'Conformité aux règles',
                    taux: mesures.conformite.taux,
                    phrase:
                        mesures.conformite.raison ||
                        fqNombre(mesures.conformite.controles) +
                            ' cas contrôlés, ' +
                            fqNombre(mesures.conformite.defauts) +
                            ' en défaut (' +
                            mesures.conformite.enDefaut +
                            ' règle(s) concernée(s))',
                    ou: 'Onglet ⚖️ Maîtrise et écran 📏 Règles & score.'
                },
                {
                    cle: 'dbTech',
                    nom: 'Lignes en double (techniques)',
                    taux: mesures.techniques.taux,
                    inverse: true,
                    phrase:
                        mesures.techniques.raison ||
                        fqNombre(mesures.techniques.enTrop) +
                            ' ligne(s) en trop sur ' +
                            fqNombre(mesures.techniques.lignes) +
                            ', en ' +
                            fqNombre(mesures.techniques.groupes) +
                            ' groupe(s) rigoureusement identiques',
                    ou: 'Écran Qualité › Doublons, sur « ' + (mesures.techniques.table || '—') + ' ».'
                },
                {
                    cle: 'dbFonc',
                    nom: 'Doublons fonctionnels (même clé)',
                    taux: mesures.fonctionnels.taux,
                    inverse: true,
                    phrase:
                        mesures.fonctionnels.raison ||
                        fqNombre(mesures.fonctionnels.enTrop) +
                            ' ligne(s) en trop sur ' +
                            fqNombre(mesures.fonctionnels.lignes) +
                            ', en ' +
                            fqNombre(mesures.fonctionnels.groupes) +
                            ' groupe(s) partageant la même clé',
                    ou: 'Écran Qualité › Doublons : la clé fonctionnelle et les doublons approchés.'
                },
                {
                    cle: 'definitions',
                    nom: 'Informations définies',
                    taux: mesures.description.tauxDecrites,
                    phrase: mesures.description.decrites + ' sur ' + mesures.description.total + ' ont une définition',
                    ou: 'Onglet 🧩 Informations : écrivez la définition de celles qui n’en ont pas.'
                },
                {
                    cle: 'branchees',
                    nom: 'Informations alimentées',
                    taux: mesures.description.tauxBranchees,
                    phrase: mesures.description.branchees + ' sur ' + mesures.description.total + ' sont reliées à une colonne',
                    ou: 'Onglet 🧩 Informations : rattachez-les à une colonne d’un fichier.'
                },
                {
                    cle: 'gouvernance',
                    nom: 'Gouvernance de la fiche',
                    taux: mesures.gouvernance.taux,
                    phrase: mesures.gouvernance.faits + ' contrôle(s) sur ' + mesures.gouvernance.total + ' sont faits',
                    ou: 'Onglet 🔎 Audit : la check-list détaillée.'
                }
            ];
        }
        // La note : la moyenne des indicateurs mesurables, les doublons retournés
        // (0 % de doublons = 100 de note). Un indicateur non mesurable ne compte pas :
        // mieux vaut une note sur cinq critères qu'une note faussée par des zéros.
        function fqNote(indicateurs) {
            const mesurables = indicateurs.filter(i => i.taux !== null && i.taux !== undefined);
            if (!mesurables.length) return null;
            const somme = mesurables.reduce((total, i) => total + (i.inverse ? 100 - i.taux : i.taux), 0);
            return Math.round(somme / mesurables.length);
        }
        // Les points faibles, du plus faible au moins faible — ce que l'on fait d'abord.
        function fqAFaireDabord(indicateurs) {
            return indicateurs
                .filter(i => i.taux !== null && i.taux !== undefined)
                .map(i => ({ nom: i.nom, note: i.inverse ? 100 - i.taux : i.taux, ou: i.ou }))
                .filter(i => i.note < FQ_SEUIL_BON)
                .sort((a, b) => a.note - b.note)
                .slice(0, FQ_POINTS_MONTRES);
        }

        async function fqCalculer(boId, bouton) {
            const bo = (state.governance.businessObjects || []).find(x => x.id === boId);
            const sortie = el('bo-fiche-qualite-' + boId);
            if (!bo || !sortie) return;
            if (bouton) bouton.disabled = true;
            sortie.innerHTML = '<p class="text-xs text-indigo-700">Calcul de la fiche de qualité…</p>';
            try {
                const { conn } = await getDB();
                // Même précaution que l'audit : mémoire relevée, pas de fichier temporaire.
                await runNoSpill(conn, async () => {
                    const controles = boControlesDeGouvernance(bo);
                    const faits = controles.filter(c => c[1]).length;
                    const mesures = {
                        completude: await fqCompletude(bo, conn),
                        conformite: await fqConformite(bo, conn),
                        techniques: await fqDoublonsTechniques(bo, conn),
                        fonctionnels: await fqDoublonsFonctionnels(bo, conn),
                        description: fqDescription(bo),
                        gouvernance: { faits: faits, total: controles.length, taux: fqTaux(faits, controles.length) }
                    };
                    const indicateurs = fqIndicateurs(mesures);
                    fqDerniereFiche = {
                        objet: bo.name,
                        date: new Date().toISOString(),
                        indicateurs: indicateurs,
                        note: fqNote(indicateurs),
                        aFaire: fqAFaireDabord(indicateurs),
                        mesures: mesures
                    };
                    sortie.innerHTML = fqRendre(fqDerniereFiche);
                });
            } catch (e) {
                sortie.innerHTML = '';
                showError('Fiche de qualité impossible : ' + e.message);
            } finally {
                if (bouton) bouton.disabled = false;
            }
        }

        // ---- Le tableau de bord ---------------------------------------------
        // Un seul grand nombre (la note), puis une tuile par indicateur : libellé,
        // valeur, état écrit en toutes lettres, et une jauge avec le repère du seuil.
        // La couleur ne porte jamais seule le message — l'état est aussi un mot.
        const FQ_ETATS = {
            bon: { mot: 'Bon', signe: '✓' },
            surveiller: { mot: 'À surveiller', signe: '▲' },
            corriger: { mot: 'À corriger', signe: '✕' },
            inconnu: { mot: 'Non mesuré', signe: '–' }
        };
        function fqEtat(note) {
            if (note === null || note === undefined) return 'inconnu';
            return note >= FQ_SEUIL_BON ? 'bon' : note >= FQ_SEUIL_MOYEN ? 'surveiller' : 'corriger';
        }
        // La note d'un indicateur : celle des doublons se lit à l'envers.
        function fqNoteDe(indicateur) {
            if (indicateur.taux === null || indicateur.taux === undefined) return null;
            return indicateur.inverse ? 100 - indicateur.taux : indicateur.taux;
        }
        function fqJauge(note) {
            const largeur = note === null ? 0 : Math.max(2, Math.min(100, note));
            return `<div class="fq-jauge"><div class="fq-piste"><i style="width:${largeur}%"></i></div>
                <span class="fq-cible" style="left:${FQ_SEUIL_BON}%" title="Seuil « bon » : ${FQ_SEUIL_BON} %"></span></div>`;
        }
        function fqTuile(indicateur) {
            const note = fqNoteDe(indicateur),
                etat = fqEtat(note),
                mots = FQ_ETATS[etat];
            const bulle = indicateur.phrase + ' — ' + indicateur.ou;
            return `<div class="fq-carte" data-etat="${etat}" data-cle="${escapeHTML(indicateur.cle)}" title="${escapeHTML(bulle)}">
                <div class="fq-lbl">${escapeHTML(indicateur.nom)}</div>
                <div class="flex items-end gap-2">
                    <span class="fq-val">${fqAffiche(indicateur.taux)}</span>
                    <span class="fq-chip ml-auto">${mots.signe} ${escapeHTML(mots.mot)}</span>
                </div>
                ${fqJauge(note)}
                <p class="fq-det">${escapeHTML(indicateur.phrase)}</p>
            </div>`;
        }
        function fqRendre(fiche) {
            const etatGlobal = fqEtat(fiche.note),
                motsGlobal = FQ_ETATS[etatGlobal];
            const pires = (fiche.mesures.completude.details || [])
                .filter(d => d.taux !== null && d.taux < FQ_SEUIL_BON)
                .sort((a, b) => a.taux - b.taux)
                .slice(0, FQ_POINTS_MONTRES);
            return `<div class="border-2 border-indigo-200 rounded-xl p-4 bg-white fq-tab" id="fqFiche">
                <div class="fq-hero fq-carte" data-etat="${etatGlobal}" style="border:0;padding:0;background:transparent">
                    <div class="fq-note">${fiche.note === null ? '—' : fiche.note}</div>
                    <div>
                        <div class="text-sm font-bold text-slate-700">Qualité de « ${escapeHTML(fiche.objet)} » <span class="text-slate-400 font-medium">sur 100</span></div>
                        <div class="mt-1"><span class="fq-chip">${motsGlobal.signe} ${escapeHTML(motsGlobal.mot)}</span></div>
                        <div class="text-[11px] text-slate-400 mt-1.5">Moyenne des indicateurs mesurables. Les doublons comptent à l’envers : moins il y en a, meilleure est la note.</div>
                    </div>
                    <button onclick="fqExporterCsv()" class="ml-auto shrink-0 text-xs bg-white border border-slate-300 rounded px-3 py-1.5 font-bold text-slate-600 hover:bg-slate-100">⬇️ Fiche (CSV)</button>
                </div>
                <div class="fq-grille">${fiche.indicateurs.map(fqTuile).join('')}</div>
                ${
                    fiche.aFaire.length
                        ? `<div>
                        <div class="text-[10px] uppercase font-bold text-slate-400 mb-1.5">🎯 À corriger en premier</div>
                        <ol class="text-xs text-slate-600 space-y-1 list-decimal list-inside">${fiche.aFaire
                            .map(
                                x =>
                                    `<li><b>${escapeHTML(x.nom)}</b> (${Math.round(x.note)}/100) — <span class="text-slate-500">${escapeHTML(x.ou)}</span></li>`
                            )
                            .join('')}</ol></div>`
                        : '<p class="text-xs text-emerald-700">✅ Aucun point faible : tous les indicateurs mesurés sont au vert.</p>'
                }
                ${
                    pires.length
                        ? `<div>
                        <div class="text-[10px] uppercase font-bold text-slate-400 mb-1.5">🕳️ Les informations les moins remplies</div>
                        <div class="fq-liste">${pires
                            .map(
                                d =>
                                    `<div class="fq-ligne fq-carte" data-etat="${fqEtat(d.taux)}" style="border:0;padding:0;background:transparent">
                                        <span><b class="text-slate-700">${escapeHTML(d.nom)}</b><br><span class="text-[10px] text-slate-400">${escapeHTML(d.table)}.${escapeHTML(d.col)}</span></span>
                                        ${fqJauge(d.taux)}
                                        <span class="fq-val" style="font-size:13px">${fqAffiche(d.taux)}</span>
                                    </div>`
                            )
                            .join('')}</div></div>`
                        : ''
                }
            </div>`;
        }

        function fqExporterCsv() {
            if (!fqDerniereFiche) return showError('Calculez d’abord la fiche de qualité.');
            const guillemets = v => '"' + String(v === null || v === undefined ? '' : v).replace(/"/g, '""') + '"';
            const lignes = [['Indicateur', 'Taux (%)', 'Détail', 'Où agir'].map(guillemets).join(';')];
            fqDerniereFiche.indicateurs.forEach(i =>
                lignes.push([i.nom, i.taux === null ? '' : i.taux, i.phrase, i.ou].map(guillemets).join(';'))
            );
            lignes.push('');
            lignes.push([guillemets('Note globale'), guillemets(fqDerniereFiche.note)].join(';'));
            downloadTextFile('qualite_' + fqDerniereFiche.objet + '.csv', lignes.join('\n'));
            showSuccess('Fiche de qualité exportée.');
        }
