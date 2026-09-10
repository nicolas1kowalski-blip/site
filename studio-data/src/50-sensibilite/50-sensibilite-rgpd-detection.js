        // ======================= 🛡 Détection RGPD / données personnelles =======================
        const PII_HEADER_RX =
            /nom|prenom|prénom|name|email|mail|tel|phone|portable|mobile|adresse|address|rue|iban|bic|naissance|birth|secu|nir|salaire|salary|cni|passeport/i;
        async function scanPII(btn) {
            if (btn) {
                btn.disabled = true;
                btn.textContent = '🛡 Analyse…';
            }
            bgTaskStart('Détection des données personnelles');
            try {
                const { conn } = await getDB();
                const found = [];
                for (const t of Object.values(state.tables).filter(x => x.status === 'ready')) {
                    for (const h of t.headers) {
                        let motif = PII_HEADER_RX.test(h) ? 'nom de colonne' : '';
                        if (!motif) {
                            try {
                                const raw = `TRIM(CAST(${sqlIdent(h)} AS VARCHAR))`;
                                const rows = arrowResultToObjects(
                                    await conn.query(`SELECT COUNT(*)::BIGINT AS n,
                                    SUM(CASE WHEN regexp_matches(${raw}, '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$') THEN 1 ELSE 0 END)::BIGINT AS em,
                                    SUM(CASE WHEN regexp_matches(${raw}, '^(\\+33|0)[1-9]([ .-]?[0-9]{2}){4}$') THEN 1 ELSE 0 END)::BIGINT AS ph,
                                    SUM(CASE WHEN regexp_matches(UPPER(${raw}), '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$') THEN 1 ELSE 0 END)::BIGINT AS ib
                                    FROM (SELECT ${sqlIdent(h)} FROM ${sqlIdent(duckTableName(t.id))} WHERE ${sqlIdent(h)} IS NOT NULL LIMIT 300) s`)
                                )[0];
                                const number = Number(rows.n) || 1;
                                if (Number(rows.em) / number > 0.3) motif = 'emails détectés';
                                else if (Number(rows.ph) / number > 0.3) motif = 'téléphones détectés';
                                else if (Number(rows.ib) / number > 0.3) motif = 'IBAN détectés';
                            } catch (e) {}
                        }
                        if (motif) {
                            found.push({ table: t.name, col: h, motif });
                            // pré-remplit la sensibilité du dictionnaire si vide
                            try {
                                const dictionaryEntry = ensureDictEntry(t.name);
                                if (dictionaryEntry.columns[h] && !dictionaryEntry.columns[h].sensitivity)
                                    dictionaryEntry.columns[h].sensitivity = 'Personnel (RGPD)';
                            } catch (e) {}
                        }
                    }
                }
                persistAppState();
                const box = el('ckPii');
                const html2 = found.length
                    ? `<div class="border border-violet-200 bg-violet-50/50 rounded-lg p-3"><div class="text-xs font-black text-violet-800 mb-1.5">🛡 ${found.length} colonne(s) à caractère personnel détectée(s) — sensibilité « Personnel (RGPD) » pré-remplie dans le dictionnaire :</div>
                        <div class="flex flex-wrap gap-1">${found
                            .slice(0, 40)
                            .map(
                                f =>
                                    `<span class="text-[10px] bg-white border border-violet-200 text-violet-700 rounded px-1.5 py-0.5" title="${escapeHTML(f.motif)}">${escapeHTML(f.table)}.${escapeHTML(f.col)}</span>`
                            )
                            .join(
                                ''
                            )}${found.length > 40 ? `<span class="text-[10px] text-slate-400">+${found.length - 40}</span>` : ''}</div></div>`
                    : '<div class="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg p-2.5">✔ Aucune donnée personnelle évidente détectée.</div>';
                if (box) box.innerHTML = html2;
                else showSuccess(`🛡 Scan RGPD : ${found.length} colonne(s) détectée(s).`);
                bgTaskEnd(`🛡 Scan RGPD terminé : ${found.length} colonne(s) marquée(s).`);
            } catch (e) {
                bgTaskEnd();
                showError('Scan RGPD impossible : ' + e.message);
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = '🛡 Détecter les données personnelles (RGPD)';
                }
            }
        }
