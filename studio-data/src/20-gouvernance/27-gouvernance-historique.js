        // ---- Historique qualité ----
        function recordQualityHistory(stats, col) {
            const cols = Object.values(stats.columns);
            const avgComp = cols.length ? cols.reduce((a, c) => a + c.completeness, 0) / cols.length : 0;
            // Résumé par colonne conservé pour comparer l'évolution entre deux audits.
            const columnsSummary = {};
            Object.entries(stats.columns).slice(0, 80).forEach(([n, c]) => {
                columnsSummary[n] = { comp: +c.completeness.toFixed(1), distinct: c.distinctCount, pattern: c.patterns && c.patterns[0] ? c.patterns[0].pattern : '' };
            });
            state.governance.qualityHistory.unshift({
                ts: Date.now(), table: stats.tableName, col: col || '(table entière)', rows: stats.totalRows,
                density: +(stats.totalCells > 0 ? (stats.filledCells / stats.totalCells) * 100 : 0).toFixed(1),
                duplicates: stats.duplicateRows, avgCompleteness: +avgComp.toFixed(1),
                columnsSummary,
            });
            if (state.governance.qualityHistory.length > 300) state.governance.qualityHistory.length = 300;
            persistQualityHistory();
            persistAppState();
        }
