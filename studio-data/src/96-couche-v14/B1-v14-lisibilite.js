        // ======================= V14.1 : ONGLET « LISIBILITÉ » DU PANNEAU ARCHITECTURE =======================
        // Le build embarque, pour chaque module, les mesures de tools/lisibilite-mesurer.mjs (lignes, commentaires,
        // gabarits, lignes de logique longues, lignes à instructions multiples, variables locales à nom court).
        // Cet onglet les affiche avec les seuils de non-régression (CONVENTIONS.md) et la liste des fichiers à reprendre,
        // pour que la lisibilité soit un fait mesuré, pas une promesse.
        const V14_READABILITY_THRESHOLDS = { longLogicLines: 15, multiStatementLines: 0, shortLocalsRatio: 0.15 };
        function v14ReadabilityTotals() {
            const totals = {
                lines: 0,
                codeLines: 0,
                commentLines: 0,
                templateLines: 0,
                longLogicLines: 0,
                multiStatementLines: 0,
                locals: 0,
                shortLocals: 0
            };
            Studio.modules().forEach(module => {
                const metrics = module.metrics;
                if (!metrics) return;
                Object.keys(totals).forEach(key => {
                    totals[key] += metrics[key] || 0;
                });
            });
            totals.shortLocalsRatio = totals.locals ? totals.shortLocals / totals.locals : 0;
            totals.commentRatio = totals.lines ? totals.commentLines / totals.lines : 0;
            totals.withinThresholds =
                totals.longLogicLines <= V14_READABILITY_THRESHOLDS.longLogicLines &&
                totals.multiStatementLines <= V14_READABILITY_THRESHOLDS.multiStatementLines &&
                totals.shortLocalsRatio <= V14_READABILITY_THRESHOLDS.shortLocalsRatio;
            return totals;
        }
        function v14ReadabilityHtml() {
            const totals = v14ReadabilityTotals();
            const percent = value => (100 * value).toFixed(1) + ' %';
            const kpi = (value, label) => `<div class="v14-kpi"><b>${value}</b><span>${label}</span></div>`;
            const modules = Studio.modules()
                .filter(module => module.metrics && v14MatchesQuery(module.file))
                .map(module => ({ file: module.file, layer: module.layer, ...module.metrics }))
                .sort(
                    (a, b) =>
                        b.longLogicLines + b.multiStatementLines - (a.longLogicLines + a.multiStatementLines) ||
                        b.shortLocals - a.shortLocals
                );
            const toFix = modules.filter(module => module.longLogicLines || module.multiStatementLines);
            const rows = (toFix.length ? toFix : modules.slice(0, 15))
                .map(
                    module => `<tr><td><code>${escapeHTML(module.file)}</code></td><td>${v14LayerBadge(module.layer)}</td><td>${module.lines}</td>
                        <td>${module.longLogicLines || '—'}</td>
                        <td>${module.multiStatementLines || '—'}</td>
                        <td>${module.shortLocals || '—'} / ${module.locals}</td>
                        <td>${module.commentLines}</td>
                        </tr>`
                )
                .join('');
            return `<div class="mb-2">${totals.withinThresholds ? '<span class="v14-ok">✓ Seuils de lisibilité respectés</span>' : '<span class="v14-ko">✗ Seuils de lisibilité dépassés</span>'}</div>
                <div class="v14-kpis">${kpi(totals.lines.toLocaleString('fr-FR'), 'lignes')}${kpi(percent(totals.commentRatio), 'commentaires')}${kpi(totals.templateLines.toLocaleString('fr-FR'), 'lignes de gabarit HTML')}${kpi(totals.longLogicLines + ' / ' + V14_READABILITY_THRESHOLDS.longLogicLines, 'lignes de logique > 160 car.')}${kpi(totals.multiStatementLines + ' / ' + V14_READABILITY_THRESHOLDS.multiStatementLines, 'lignes à ≥ 3 instructions')}${kpi(percent(totals.shortLocalsRatio) + ' / ' + percent(V14_READABILITY_THRESHOLDS.shortLocalsRatio), 'variables à nom court')}</div>
                <h4>${toFix.length ? 'Fichiers à reprendre (' + toFix.length + ')' : 'Fichiers les plus riches en variables à nom court'}</h4>
                <table class="v14-tbl"><thead><tr><th>Fichier</th>
                    <th>Couche</th>
                    <th>Lignes</th>
                    <th>Logique > 160</th>
                    <th>≥ 3 instr.</th>
                    <th>Noms courts</th>
                    <th>Commentaires</th>
                    </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                    </table>
                <div class="v14-helprow">Mesuré à la construction par <code>tools/lisibilite-mesurer.mjs</code> (<code>--strict</code> échoue si un seuil est dépassé). Outils de reprise : <code>tools/formater.mjs</code> (Prettier), <code>tools/renommer-locales.mjs</code> (renommage par portée), <code>tools/gabarits-aerer.mjs</code> (retours à la ligne dans les gabarits). Une ligne de gabarit HTML ou de texte n'est pas une ligne de logique.</div>`;
        }
        Studio.extend(
            'v14ArchBodyHtml',
            base =>
                function () {
                    return v14State.tab === 'lisibilite' ? v14ReadabilityHtml() : base.apply(this, arguments);
                },
            { motif: 'onglet Lisibilité' }
        );
        Studio.extend(
            'v14ArchOpen',
            base =>
                function () {
                    const result = base.apply(this, arguments);
                    try {
                        const tabs = document.querySelector('#v14Arch .v14-tabs');
                        if (tabs && !tabs.querySelector('[data-tab="lisibilite"]')) {
                            tabs.insertAdjacentHTML(
                                'beforeend',
                                '<button data-tab="lisibilite" onclick="v14ArchTab(\'lisibilite\')">Lisibilité</button>'
                            );
                        }
                    } catch (error) {
                        console.warn('v14 lisibilité', error);
                    }
                    return result;
                },
            { motif: "bouton de l'onglet Lisibilité" }
        );
        Object.assign(V11_LEXIQUE, {
            'lisibilité (mesure)':
                'Compte, fichier par fichier, les lignes de logique trop longues, les lignes à plusieurs instructions et les variables à nom court. Des seuils de non-régression, vérifiés par les tests, empêchent de revenir en arrière.'
        });
