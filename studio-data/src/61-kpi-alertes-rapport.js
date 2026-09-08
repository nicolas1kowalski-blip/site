        // ======================= E12 (V2) : KPI, SEUILS, ALERTES & RAPPORT GLOBAL =======================
        // Seuils déclarés sur les tuiles « Indicateur » (⚠ alerte / ⛔ critique, sens ≥ ou ≤) +
        // seuil de score qualité global. Évaluation à la demande, 100 % locale, rapport HTML autonome.
        function dbKpiStatus(t, v) {
            const w = parseFloat(t.thWarn), c2 = parseFloat(t.thCrit);
            if (isNaN(w) && isNaN(c2)) return null;
            const hit = th => (t.thDir || 'max') === 'min' ? v <= th : v >= th;
            if (!isNaN(c2) && hit(c2)) return 'crit';
            if (!isNaN(w) && hit(w)) return 'warn';
            return 'ok';
        }
        async function dbCheckAlerts(btn) {
            if (btn) btn.disabled = true;
            bgTaskStart('Évaluation des indicateurs et des seuils');
            const alerts = [];
            try {
                const { conn } = await getDB();
                for (const d of dbList()) for (const t of d.tiles) {
                    if (t.kind !== 'kpi') continue;
                    if (isNaN(parseFloat(t.thWarn)) && isNaN(parseFloat(t.thCrit))) continue;
                    const sql = dbTileSql(d, t); if (!sql) continue;
                    try {
                        const rows = arrowResultToObjects(await conn.query(sql));
                        const v = rows[0] ? Number(rows[0].v) : 0;
                        alerts.push({ dash: d.name, kpi: t.title, v, st: dbKpiStatus(t, v) || 'ok', thWarn: t.thWarn, thCrit: t.thCrit, dir: t.thDir || 'max' });
                    } catch (e2) { alerts.push({ dash: d.name, kpi: t.title, v: null, st: 'err', err: e2.message, dir: t.thDir || 'max' }); }
                }
                const ms = parseFloat(state.qualityMinScore);
                if (!isNaN(ms) && qrSnapshots.length) {
                    const last = qrSnapshots[qrSnapshots.length - 1];
                    if (last.global != null) alerts.push({ dash: 'Qualité (E2)', kpi: 'Score qualité global', v: last.global, st: last.global < ms ? 'crit' : 'ok', thCrit: ms, dir: 'min' });
                }
                dbState.alerts = { at: Date.now(), list: alerts };
                if (!dbState.openId) renderDashboards();
                const nc = alerts.filter(a => a.st === 'crit').length, nw = alerts.filter(a => a.st === 'warn').length;
                bgTaskEnd((nc + nw) ? `🔔 ${nc} alerte(s) critique(s) et ${nw} avertissement(s) sur ${alerts.length} indicateur(s) suivi(s).` : `✅ ${alerts.length} indicateur(s) suivi(s) — tous dans les seuils.`);
            } catch (e) { bgTaskEnd(); showError('Vérification des alertes impossible : ' + e.message); }
            finally { if (btn) btn.disabled = false; }
            return alerts;
        }
        function dbAlertIcon(a) { return a.st === 'crit' ? '⛔' : (a.st === 'warn' ? '⚠️' : (a.st === 'err' ? '❓' : '✅')); }
        function dbAlertsHtml() {
            const A = dbState.alerts; if (!A) return '';
            if (!A.list.length) return '<div class="border border-slate-200 rounded-lg p-3 text-xs text-slate-400 mb-4 italic">Aucun indicateur suivi — définissez des seuils ⚠/⛔ sur des tuiles « Indicateur », ou un score qualité minimal.</div>';
            const box = A.list.some(a => a.st === 'crit') ? 'border-red-300 bg-red-50/40' : (A.list.some(a => a.st === 'warn') ? 'border-amber-300 bg-amber-50/40' : 'border-emerald-200 bg-emerald-50/30');
            return `<div class="border ${box} rounded-xl p-3 mb-4">
                <div class="text-xs font-bold text-slate-600 mb-1.5">🔔 Alertes — vérifiées le ${new Date(A.at).toLocaleString('fr-FR')}</div>
                <table class="w-full text-[11px]"><thead><tr class="text-left text-slate-400"><th class="py-0.5 w-8">État</th><th>Tableau de bord</th><th>Indicateur</th><th class="text-right">Valeur</th><th class="text-right">Seuils</th></tr></thead><tbody>
                ${A.list.map(a => `<tr class="border-t border-slate-200/60"><td class="py-1">${dbAlertIcon(a)}</td><td>${escapeHTML(a.dash)}</td><td class="font-bold">${escapeHTML(a.kpi)}</td><td class="text-right font-bold">${a.v == null ? escapeHTML(a.err || '—') : Number(a.v).toLocaleString('fr-FR')}</td><td class="text-right text-slate-400">${a.dir === 'min' ? '≤' : '≥'}${a.thWarn != null && a.thWarn !== '' && a.thWarn !== undefined ? ' ⚠ ' + escapeHTML(String(a.thWarn)) : ''}${a.thCrit != null && a.thCrit !== '' ? ' ⛔ ' + escapeHTML(String(a.thCrit)) : ''}</td></tr>`).join('')}</tbody></table></div>`;
        }
        async function dbExportReport(btn) {
            const alerts = await dbCheckAlerts(btn);
            const esc = escapeHTML;
            const last = qrSnapshots.length ? qrSnapshots[qrSnapshots.length - 1] : null;
            const td = 'border-top:1px solid #e2e8f0;padding:6px 8px;font-size:12px';
            const secAlerts = alerts.length ? `<table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;border-radius:8px">
                <tr><th style="${td};text-align:left">État</th><th style="${td};text-align:left">Tableau de bord</th><th style="${td};text-align:left">Indicateur</th><th style="${td};text-align:right">Valeur</th><th style="${td};text-align:right">Seuils</th></tr>
                ${alerts.map(a => `<tr><td style="${td}">${dbAlertIcon(a)}</td><td style="${td}">${esc(a.dash)}</td><td style="${td};font-weight:700">${esc(a.kpi)}</td><td style="${td};text-align:right;font-weight:700;color:${a.st === 'crit' ? '#dc2626' : (a.st === 'warn' ? '#d97706' : '#0f766e')}">${a.v == null ? esc(a.err || '—') : Number(a.v).toLocaleString('fr-FR')}</td><td style="${td};text-align:right;color:#94a3b8">${a.dir === 'min' ? '≤' : '≥'}${a.thWarn != null && a.thWarn !== '' ? ' ⚠ ' + esc(String(a.thWarn)) : ''}${a.thCrit != null && a.thCrit !== '' ? ' ⛔ ' + esc(String(a.thCrit)) : ''}</td></tr>`).join('')}</table>` : '<p style="color:#94a3b8;font-size:12px">Aucun indicateur avec seuil défini.</p>';
            const secQual = last ? `<p style="font-size:13px">Score global : <b style="font-size:20px;color:${last.global >= 90 ? '#059669' : (last.global >= 70 ? '#d97706' : '#dc2626')}">${last.global != null ? last.global + ' %' : '—'}</b> <span style="color:#94a3b8;font-size:11px">(instantané du ${new Date(last.at).toLocaleString('fr-FR')})</span></p>
                <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0"><tr><th style="${td};text-align:left">Table</th><th style="${td};text-align:right">Score</th><th style="${td};text-align:right">Règles</th></tr>
                ${Object.entries(last.tables || {}).map(([tn, o2]) => `<tr><td style="${td}">${esc(tn)}</td><td style="${td};text-align:right;font-weight:700">${o2.score != null ? o2.score + ' %' : '—'}</td><td style="${td};text-align:right">${(o2.rules || []).length}</td></tr>`).join('')}</table>` : '<p style="color:#94a3b8;font-size:12px">Aucun instantané qualité — lancez les règles (📏 Règles & score) pour alimenter cette section.</p>';
            const kpiOf = d => d.tiles.filter(t => t.kind === 'kpi' && t._v != null).map(t => `${esc(t.title)} : <b>${Number(t._v).toLocaleString('fr-FR')}</b>`).join(' · ');
            const secDash = dbList().length ? `<ul style="font-size:12px;padding-left:18px">${dbList().map(d => `<li style="margin-bottom:4px"><b>${esc(d.name)}</b> — ${d.tiles.length} tuile(s)${kpiOf(d) ? ' · ' + kpiOf(d) : ''}</li>`).join('')}</ul>` : '<p style="color:#94a3b8;font-size:12px">Aucun tableau de bord.</p>';
            const srcs = Object.values(state.tables).filter(t => t.status === 'ready');
            const g = state.governance;
            const html2 = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Rapport Studio Data</title></head><body style="font-family:system-ui;background:#f8fafc;margin:0;padding:28px;color:#0f172a">
                <h1 style="font-size:22px;margin:0">📄 Rapport de gouvernance & qualité</h1>
                <p style="font-size:11px;color:#64748b">Généré le ${new Date().toLocaleString('fr-FR')} — produit localement par Studio Data, aucune donnée transmise.</p>
                <p style="font-size:12px;color:#334155">${srcs.length} source(s) chargée(s) · ${(g.qualityRules || []).length} règle(s) qualité · ${(g.businessObjects || []).length} objet(s) métier · ${dbList().length} tableau(x) de bord · ${(state.recipes || []).length} préparation(s)</p>
                <h2 style="font-size:15px;margin-top:22px">🔔 Indicateurs & seuils</h2>${secAlerts}
                <h2 style="font-size:15px;margin-top:22px">📏 Qualité des données</h2>${secQual}
                <h2 style="font-size:15px;margin-top:22px">📋 Tableaux de bord</h2>${secDash}
                </body></html>`;
            const blob = new Blob([html2], { type: 'text/html' });
            const a2 = document.createElement('a'); a2.href = URL.createObjectURL(blob); a2.download = `RAPPORT_STUDIO_DATA_${new Date().toISOString().slice(0, 10)}.html`; document.body.appendChild(a2); a2.click(); a2.remove();
        }

