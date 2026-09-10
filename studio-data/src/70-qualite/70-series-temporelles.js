        /* ================= SÉRIES TEMPORELLES (V7.4) =================
           Le reste de l'application repose sur « une ligne = une entité ». Sur une série
           temporelle ce postulat tombe : une ligne est une OBSERVATION, l'entité est la
           série. D'où deux angles morts que rien ici ne savait voir :
             — la ligne qui n'existe pas (le trou), invisible à tout contrôle par ligne ;
             — la valeur impossible en tant que VARIATION, alors qu'elle est banale dans
               la distribution globale.
           On déclare donc la maille (clé de série, horodatage, mesure) et on raisonne
           ensuite en fenêtre PARTITION BY série ORDER BY horodatage.
           Le pas peut être déclaré ou détecté série par série : certaines séries sont
           cadencées, d'autres événementielles, et les contrôles de trou/couverture
           n'ont de sens que pour les premières. La régularité est donc MESURÉE
           (part des intervalles égaux à l'intervalle dominant) et non supposée.
           ============================================================================ */
        const TS_STEPS = [
            { v: 'auto', l: 'Détecté série par série' },
            { v: '60', l: 'Minute' },
            { v: '300', l: '5 minutes' },
            { v: '900', l: "Quart d'heure" },
            { v: '1800', l: 'Demi-heure' },
            { v: '3600', l: 'Heure' },
            { v: '86400', l: 'Jour' },
            { v: '604800', l: 'Semaine' }
        ];
        function tsList() {
            return (state.governance.series = state.governance.series || []);
        }
        function tsById(id) {
            return tsList().find(x => x.id === id);
        }
        function tsForTable(name) {
            return tsList().find(x => x.table === name);
        }
        function tsCfgOk(c) {
            return !!(c && c.table && c.tsCol && (c.keyCols || []).length);
        }
        function tsAdd() {
            tsList().push({
                id: 'tsr_' + generateId(),
                name: 'Nouvelle série',
                table: '',
                keyCols: [],
                tsCol: '',
                valCol: '',
                step: 'auto',
                tol: 0.5,
                regMin: 0.7
            });
            persistAppState();
            renderTimeSeries();
        }
        function tsSet(id, f, v) {
            const series = tsById(id);
            if (!series) return;
            if (f === 'keyCols')
                series.keyCols = Array.isArray(v)
                    ? v
                    : String(v ? [v] : [])
                          .split(',')
                          .filter(Boolean);
            else series[f] = v;
            if (f === 'table') {
                series.keyCols = [];
                series.tsCol = '';
                series.valCol = '';
            }
            persistAppState();
            renderTimeSeries();
        }
        function tsDel(id) {
            state.governance.series = tsList().filter(x => x.id !== id);
            persistAppState();
            renderTimeSeries();
        }

        // ---- Expressions normalisées : tout est stocké en VARCHAR, on convertit ici ----
        const TS_FMTS = [
            '%Y-%m-%d %H:%M:%S',
            '%Y-%m-%dT%H:%M:%S',
            '%d/%m/%Y %H:%M:%S',
            '%d/%m/%Y %H:%M',
            '%Y-%m-%d %H:%M',
            '%Y/%m/%d %H:%M:%S',
            '%d-%m-%Y %H:%M:%S',
            '%Y-%m-%d',
            '%d/%m/%Y'
        ];
        function tsTsSql(col) {
            const t = `TRIM(CAST(${sqlIdent(col)} AS VARCHAR))`;
            return `COALESCE(${TS_FMTS.map(f => `TRY_CAST(TRY_STRPTIME(${t}, '${f}') AS TIMESTAMP)`).join(', ')}, TRY_CAST(${t} AS TIMESTAMP))`;
        }
        function tsValSql(col) {
            return col ? qrNumSql(sqlIdent(col)) : 'NULL::DOUBLE';
        }
        function tsKeySql(cols) {
            return cols.length === 1
                ? `CAST(${sqlIdent(cols[0])} AS VARCHAR)`
                : `concat_ws(chr(1), ${cols.map(c => `CAST(${sqlIdent(c)} AS VARCHAR)`).join(', ')})`;
        }
        // Bloc WITH partagé par tout ce qui suit : b (observations normalisées), st (points
        // consécutifs), md (pas dominant), rg (régularité mesurée), ok (séries cadencées).
        function tsCte(c, T) {
            const reg = Number(c.regMin != null ? c.regMin : 0.7);
            const md =
                c.step && c.step !== 'auto'
                    ? `md AS (SELECT DISTINCT sid, ${Number(c.step)}::BIGINT AS pas FROM b)`
                    : `md AS (SELECT sid, mode(d)::BIGINT AS pas FROM st WHERE d IS NOT NULL AND d > 0 GROUP BY sid)`;
            return `WITH b AS (
            SELECT ${tsKeySql(c.keyCols)} AS sid, ${tsTsSql(c.tsCol)} AS ts, ${tsValSql(c.valCol)} AS v
            FROM ${T} WHERE ${tsTsSql(c.tsCol)} IS NOT NULL AND ${tsKeySql(c.keyCols)} IS NOT NULL),
          st AS (SELECT sid, ts, v,
            LAG(ts) OVER (PARTITION BY sid ORDER BY ts) AS pts,
            LAG(v)  OVER (PARTITION BY sid ORDER BY ts) AS pv,
            date_diff('second', LAG(ts) OVER (PARTITION BY sid ORDER BY ts), ts) AS d FROM b),
          ${md},
          rg AS (SELECT s.sid, m.pas, COUNT(*) AS n_int,
            SUM(CASE WHEN s.d = m.pas THEN 1 ELSE 0 END) * 1.0 / NULLIF(COUNT(*), 0) AS reg
            FROM st s JOIN md m ON m.sid = s.sid WHERE s.d IS NOT NULL GROUP BY s.sid, m.pas),
          ok AS (SELECT sid, pas FROM rg WHERE pas > 0 AND ${c.step && c.step !== 'auto' ? '1=1' : `reg >= ${reg} AND n_int >= 3`}),
          pl AS (SELECT sid, v, ts, ROW_NUMBER() OVER (PARTITION BY sid ORDER BY ts)
               - ROW_NUMBER() OVER (PARTITION BY sid, v ORDER BY ts) AS grp FROM b WHERE v IS NOT NULL)`;
        }

        // ---- Profilage par série (lot 1) ----
        function tsProfileSql(c, T) {
            const tol = Number(c.tol != null ? c.tol : 0.5);
            return `${tsCte(c, T)},
          agg AS (SELECT sid, COUNT(*) AS n, COUNT(DISTINCT ts) AS n_ts, MIN(ts) AS t0, MAX(ts) AS t1,
              COUNT(v) AS n_val, MIN(v) AS vmin, MAX(v) AS vmax, AVG(v) AS vavg FROM b GROUP BY sid),
          gp AS (SELECT s.sid, SUM(CASE WHEN s.d > o.pas * ${1 + tol} THEN 1 ELSE 0 END) AS trous,
              MAX(s.d) AS ecart_max FROM st s JOIN ok o ON o.sid = s.sid WHERE s.d IS NOT NULL GROUP BY s.sid),
          pm AS (SELECT sid, MAX(c) AS plateau FROM (SELECT sid, v, grp, COUNT(*) AS c FROM pl GROUP BY sid, v, grp) GROUP BY sid)
        SELECT a.sid AS serie, a.n AS points, a.n - a.n_ts AS doublons,
          a.t0 AS debut, a.t1 AS fin, a.n_val AS mesures,
          r.pas AS pas_sec, ROUND(COALESCE(r.reg, 0) * 100, 1) AS regularite,
          (o.sid IS NOT NULL) AS cadencee,
          COALESCE(g.trous, 0) AS trous, g.ecart_max AS plus_long_trou_sec,
          CASE WHEN o.pas > 0 THEN ROUND(100.0 * a.n_ts / NULLIF(FLOOR(date_diff('second', a.t0, a.t1) / o.pas) + 1, 0), 1) END AS couverture,
          COALESCE(p.plateau, 0) AS plateau_max,
          date_diff('second', a.t1, (SELECT MAX(ts) FROM b)) AS retard_sec,
          a.vmin, a.vmax, ROUND(a.vavg, 4) AS vmoy
        FROM agg a LEFT JOIN rg r ON r.sid = a.sid LEFT JOIN ok o ON o.sid = a.sid
          LEFT JOIN gp g ON g.sid = a.sid LEFT JOIN pm p ON p.sid = a.sid
        ORDER BY COALESCE(g.trous, 0) DESC, a.sid`;
        }
        // ---- Calendrier de couverture : nb de points par (série, période) ----
        const TS_BUCKETS = { hour: 'heure', day: 'jour', week: 'semaine', month: 'mois' };
        function tsCalendarSql(c, T, bucket, limit) {
            const b = TS_BUCKETS[bucket] ? bucket : 'day';
            return `${tsCte(c, T)}
        SELECT sid AS serie, date_trunc('${b}', ts) AS periode, COUNT(*) AS n
        FROM b GROUP BY sid, date_trunc('${b}', ts)
        ORDER BY sid, periode LIMIT ${Number(limit) || 20000}`;
        }
        // Choisit une maille d'affichage qui tienne à l'écran (≈ 200 colonnes max).
        function tsPickBucket(spanSec) {
            if (!(spanSec > 0)) return 'day';
            for (const [b, s] of [
                ['hour', 3600],
                ['day', 86400],
                ['week', 604800],
                ['month', 2592000]
            ])
                if (spanSec / s <= 200) return b;
            return 'month';
        }

        // ---- Les huit contrôles (lot 2) ----
        // Chacun renvoie une requête produisant total + fails, à la maille qui lui convient.
        const QR_TS_TYPES = {
            ts_gap: 'Série : trou (point attendu absent)',
            ts_dup: 'Série : doublon sur (série, horodatage)',
            ts_flat: 'Série : valeur figée (capteur bloqué)',
            ts_jump: 'Série : saut entre deux points',
            ts_mono: 'Série : monotonie (compteur qui recule)',
            ts_fresh: "Série : fraîcheur (série qui n'alimente plus)",
            ts_season: 'Série : aberrant saisonnier (même heure/jour)',
            ts_cover: 'Série : couverture insuffisante'
        };
        const QR_SERIES = Object.keys(QR_TS_TYPES);
        // Unité comptée par chaque contrôle — sert à libeller « N ... en échec ».
        const QR_TS_UNIT = {
            ts_gap: 'intervalle',
            ts_dup: 'horodatage',
            ts_flat: 'point',
            ts_jump: 'intervalle',
            ts_mono: 'intervalle',
            ts_fresh: 'série',
            ts_season: 'point',
            ts_cover: 'série'
        };
        // Restreint un contrôle à un sous-ensemble de séries : sur un fichier hétérogène (un
        // compteur cumulatif à côté d'une mesure instantanée), la monotonie n'est vraie que
        // pour une partie des identifiants.
        function tsFilterSql(p) {
            const text = String((p && p.serieLike) || '').trim();
            return text ? ` AND sid LIKE ${sqlLiteral(text)}` : '';
        }
        function tsRuleQuery(r, c, T) {
            const p = r.p || {};
            const tol = Number(c.tol != null ? c.tol : 0.5);
            const flt = tsFilterSql(p);
            const two = (total, fails, from) =>
                `${tsCte(c, T)}\nSELECT (${total})::BIGINT AS total, COALESCE((${fails}), 0)::BIGINT AS fails${from ? ' ' + from : ''}`;
            switch (r.type) {
                case 'ts_dup':
                    return two(
                        'COUNT(*)',
                        'SUM(CASE WHEN n > 1 THEN 1 ELSE 0 END)',
                        `FROM (SELECT sid, ts, COUNT(*) AS n FROM b WHERE 1=1${flt} GROUP BY sid, ts)`
                    );
                case 'ts_gap':
                    return two(
                        'COUNT(*)',
                        `SUM(CASE WHEN s.d > o.pas * ${1 + tol} THEN 1 ELSE 0 END)`,
                        `FROM st s JOIN ok o ON o.sid = s.sid WHERE s.d IS NOT NULL${flt.replace('sid', 's.sid')}`
                    );
                case 'ts_flat': {
                    const maximum = Math.max(2, Number(p.minLen) || 3);
                    return (
                        `${tsCte(c, T)}\nSELECT (SELECT COUNT(*) FROM b WHERE v IS NOT NULL${flt})::BIGINT AS total,` +
                        ` COALESCE((SELECT SUM(c) FROM (SELECT COUNT(*) AS c FROM pl WHERE 1=1${flt} GROUP BY sid, v, grp HAVING COUNT(*) >= ${maximum})), 0)::BIGINT AS fails`
                    );
                }
                case 'ts_jump': {
                    const abs = p.jumpAbs !== '' && p.jumpAbs != null ? Number(p.jumpAbs) : null;
                    const pct = p.jumpPct !== '' && p.jumpPct != null ? Number(p.jumpPct) : null;
                    const conds = [];
                    if (abs != null && isFinite(abs)) conds.push(`abs(v - pv) > ${abs}`);
                    if (pct != null && isFinite(pct)) conds.push(`(pv <> 0 AND abs(v - pv) / abs(pv) * 100 > ${pct})`);
                    if (!conds.length) return null;
                    return two(
                        'COUNT(*)',
                        `SUM(CASE WHEN ${conds.join(' OR ')} THEN 1 ELSE 0 END)`,
                        `FROM st WHERE pv IS NOT NULL AND v IS NOT NULL${flt}`
                    );
                }
                case 'ts_mono': {
                    const dec = p.sens === 'decroissant';
                    return two(
                        'COUNT(*)',
                        `SUM(CASE WHEN v ${dec ? '>' : '<'} pv THEN 1 ELSE 0 END)`,
                        `FROM st WHERE pv IS NOT NULL AND v IS NOT NULL${flt}`
                    );
                }
                case 'ts_fresh': {
                    const h = Number(p.maxAgeH) || 24;
                    const ref = p.ref === 'now' ? 'now()::TIMESTAMP' : '(SELECT MAX(ts) FROM b)';
                    return two(
                        'COUNT(*)',
                        `SUM(CASE WHEN retard > ${h} THEN 1 ELSE 0 END)`,
                        `FROM (SELECT sid, date_diff('hour', MAX(ts), ${ref}) AS retard FROM b WHERE 1=1${flt} GROUP BY sid)`
                    );
                }
                case 'ts_cover': {
                    const min = Number(p.minPct) || 95;
                    return `${tsCte(c, T)},
          agg AS (SELECT sid, COUNT(DISTINCT ts) AS n_ts, MIN(ts) AS t0, MAX(ts) AS t1 FROM b WHERE 1=1${flt} GROUP BY sid),
          cv AS (SELECT a.sid, 100.0 * a.n_ts / NULLIF(FLOOR(date_diff('second', a.t0, a.t1) / o.pas) + 1, 0) AS taux
         FROM agg a JOIN ok o ON o.sid = a.sid)
        SELECT COUNT(*)::BIGINT AS total, COALESCE(SUM(CASE WHEN taux < ${min} THEN 1 ELSE 0 END), 0)::BIGINT AS fails FROM cv`;
                }
                case 'ts_season': {
                    const k = Number(p.k) || 4;
                    const bk =
                        p.bucket === 'dow'
                            ? 'extract(dow FROM ts)'
                            : p.bucket === 'month'
                              ? 'extract(month FROM ts)'
                              : 'extract(hour FROM ts)';
                    // Écart robuste à la médiane du MÊME créneau (heure du jour, jour de semaine
                    // ou mois) pour la MÊME série : une valeur basse la nuit cesse d'être aberrante.
                    return `${tsCte(c, T)},
          s AS (SELECT sid, ${bk} AS bk, ts, v FROM b WHERE v IS NOT NULL${flt}),
          m1 AS (SELECT sid, bk, median(v) AS med FROM s GROUP BY sid, bk),
          m2 AS (SELECT s.sid, s.bk, median(abs(s.v - m1.med)) AS mad, avg(abs(s.v - m1.med)) AS aad, COUNT(*) AS n
         FROM s JOIN m1 ON m1.sid = s.sid AND m1.bk = s.bk GROUP BY s.sid, s.bk),
          ms AS (SELECT sid, median(v) AS smed FROM s GROUP BY sid),
          m3 AS (SELECT s.sid, median(abs(s.v - ms.smed)) AS smad FROM s JOIN ms ON ms.sid = s.sid GROUP BY s.sid)
        SELECT COUNT(*)::BIGINT AS total,
          COALESCE(SUM(CASE WHEN m2.n >= 4 AND (
        CASE WHEN m2.mad > 0  THEN abs(s.v - m1.med) > ${k} * 1.4826 * m2.mad
             WHEN m2.aad > 0  THEN abs(s.v - m1.med) > ${k} * 1.2533 * m2.aad
             WHEN m3.smad > 0 THEN abs(s.v - m1.med) > ${k} * 1.4826 * m3.smad
             ELSE FALSE END) THEN 1 ELSE 0 END), 0)::BIGINT AS fails
        FROM s JOIN m1 ON m1.sid = s.sid AND m1.bk = s.bk JOIN m2 ON m2.sid = s.sid AND m2.bk = s.bk
             JOIN m3 ON m3.sid = s.sid`;
                }
            }
            return null;
        }

        // ---- Écran « Séries temporelles » : déclaration de la maille, profil, calendrier ----
        let tsView = { id: '', prof: null, cal: null, bucket: '', busy: false };
        function tsPickCfg(id) {
            tsView = { id, prof: null, cal: null, bucket: '', busy: false };
            renderTimeSeries();
        }
        async function tsAnalyse(id) {
            const series = tsById(id);
            if (!tsCfgOk(series)) return showError("Déclarez d'abord la clé de série et l'horodatage.");
            const table = tableByName(series.table);
            if (!table || table.status !== 'ready') return showError("La source n'est pas chargée.");
            tsView.id = id;
            tsView.busy = true;
            renderTimeSeries();
            try {
                const { conn } = await getDB();
                const T = sqlIdent(duckTableName(table.id));
                tsView.prof = arrowResultToObjects(await conn.query(tsProfileSql(series, T)));
                // La maille d'affichage suit l'amplitude réelle des données.
                let span = 0;
                tsView.prof.forEach(r => {
                    const date = new Date(r.debut).getTime(),
                        b = new Date(r.fin).getTime();
                    if (isFinite(date) && isFinite(b)) span = Math.max(span, (b - date) / 1000);
                });
                tsView.bucket = tsPickBucket(span);
                tsView.cal = arrowResultToObjects(await conn.query(tsCalendarSql(series, T, tsView.bucket, 20000)));
            } catch (e) {
                showError('Analyse impossible : ' + e.message);
            }
            tsView.busy = false;
            renderTimeSeries();
        }
        function tsDur(sec) {
            const number = Number(sec);
            if (!isFinite(number) || number <= 0) return '—';
            if (number < 60) return number + ' s';
            if (number < 3600) return Math.round(number / 60) + ' min';
            if (number < 86400) return (number / 3600).toFixed(number % 3600 ? 1 : 0) + ' h';
            return (number / 86400).toFixed(number % 86400 ? 1 : 0) + ' j';
        }
        function tsCalendarHtml() {
            const rows = tsView.cal;
            if (!rows || !rows.length) return '';
            const series = [...new Set(rows.map(r => r.serie))];
            const periods = [...new Set(rows.map(r => String(r.periode)))].sort();
            const byKey = new Map();
            rows.forEach(r => byKey.set(r.serie + '|' + String(r.periode), Number(r.n)));
            // Le mode : nombre de points « normal » par case. Une case en dessous = alimentation
            // partielle ; au-dessus = doublons. C'est là que les trous se voient d'un coup d'œil.
            const counts = rows.map(r => Number(r.n));
            const freq = {};
            counts.forEach(n => (freq[n] = (freq[n] || 0) + 1));
            const norm = Number(Object.keys(freq).sort((a, b) => freq[b] - freq[a])[0]) || 1;
            const cell = n => {
                if (n === undefined) return `<span class="tsc tsc-0" title="aucun point"></span>`;
                if (n > norm) return `<span class="tsc tsc-x" title="${n} points (attendu ${norm}) — doublons"></span>`;
                if (n < norm) return `<span class="tsc tsc-p" title="${n} points sur ${norm} — incomplet"></span>`;
                return `<span class="tsc tsc-f" title="${n} points"></span>`;
            };
            const fmt = p => {
                const date = new Date(p);
                return isFinite(date.getTime())
                    ? tsView.bucket === 'hour'
                        ? date.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit' })
                        : date.toLocaleDateString('fr-FR')
                    : String(p);
            };
            return `<div class="mt-4">
              <div class="flex items-center gap-3 flex-wrap mb-2">
                <h4 class="font-bold text-sm">Calendrier de couverture</h4>
                <span class="text-[11px] text-slate-500">maille : ${TS_BUCKETS[tsView.bucket] || tsView.bucket} · ${norm} point(s) attendu(s) par case</span>
                <span class="flex items-center gap-2 text-[10px] ml-auto">
                  <span class="flex items-center gap-1"><span class="tsc tsc-f"></span> complet</span>
                  <span class="flex items-center gap-1"><span class="tsc tsc-p"></span> partiel</span>
                  <span class="flex items-center gap-1"><span class="tsc tsc-0"></span> aucun point</span>
                  <span class="flex items-center gap-1"><span class="tsc tsc-x"></span> doublons</span>
                </span>
              </div>
              <div class="overflow-x-auto border border-slate-200 rounded-xl p-3">
                <table class="tscal"><tbody>
                ${series
                    .map(
                        s => `<tr><td class="tsc-lbl" title="${escapeHTML(s)}">${escapeHTML(String(s).slice(0, 28))}</td>
                   ${periods.map(p => `<td>${cell(byKey.get(s + '|' + p))}</td>`).join('')}</tr>`
                    )
                    .join('')}
                <tr><td class="tsc-lbl"></td>${periods
                    .map(
                        (p, i) =>
                            `<td class="tsc-ax">${i === 0 || i === periods.length - 1 || i === Math.floor(periods.length / 2) ? fmt(p) : ''}</td>`
                    )
                    .join('')}</tr>
                </tbody></table>
              </div></div>`;
        }
        function renderTimeSeries() {
            const tsContentElement = el('tsContent');
            if (!tsContentElement) return '';
            const html = tsScreenHtml();
            tsContentElement.innerHTML = html;
            return html;
        }
        function tsScreenHtml() {
            const list = tsList();
            const tables = Object.values(state.tables).filter(t => t.status === 'ready');
            const cur = tsById(tsView.id) || list[0];
            const tsel = (cfg, f, cur2, opts, ph) =>
                `<select onchange="tsSet('${cfg.id}','${f}',this.value)" class="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white"><option value="">${ph}</option>${opts.map(o => `<option value="${escapeHTML(o)}" ${cur2 === o ? 'selected' : ''}>${escapeHTML(o)}</option>`).join('')}</select>`;
            const cards = list
                .map(cfg => {
                    const table = tableByName(cfg.table);
                    const hs = table ? table.headers : [];
                    const on = cur && cur.id === cfg.id;
                    return `<div class="border ${on ? 'border-indigo-300' : 'border-slate-200'} rounded-xl p-3 mb-2 bg-white">
                  <div class="flex items-center gap-2 flex-wrap">
                    <input value="${escapeHTML(cfg.name || '')}" onchange="tsSet('${cfg.id}','name',this.value)" class="font-bold text-sm border-b border-transparent hover:border-slate-200 w-44">
                    <select onchange="tsSet('${cfg.id}','table',this.value)" class="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white">
                      <option value="">— source —</option>${tables.map(t2 => `<option value="${escapeHTML(t2.name)}" ${cfg.table === t2.name ? 'selected' : ''}>${escapeHTML(t2.name)}</option>`).join('')}</select>
                    <button onclick="tsPickCfg('${cfg.id}')" class="text-xs px-2 py-1 rounded-lg bg-white border border-slate-200">Sélectionner</button>
                    <button onclick="tsAnalyse('${cfg.id}')" class="text-xs px-3 py-1 rounded-lg bg-indigo-600 text-white font-bold">Analyser</button>
                    <button onclick="tsDel('${cfg.id}')" class="ml-auto text-slate-300 hover:text-red-500 font-bold">✕</button>
                  </div>
                  <div class="flex items-center gap-2 flex-wrap mt-2 text-xs">
                    <span class="text-slate-500">Clé de série</span>
                    <input value="${escapeHTML((cfg.keyCols || []).join(';'))}" onchange="tsSet('${cfg.id}','keyCols',this.value.split(';').map(x=>x.trim()).filter(Boolean))"
                       placeholder="ex : ID (plusieurs séparées par ;)" class="border border-slate-200 rounded-lg px-2 py-1 text-xs w-52" list="tsCols_${cfg.id}">
                    <datalist id="tsCols_${cfg.id}">${hs.map(h => `<option value="${escapeHTML(h)}">`).join('')}</datalist>
                    <span class="text-slate-500">Horodatage</span> ${tsel(cfg, 'tsCol', cfg.tsCol, hs, '— colonne —')}
                    <span class="text-slate-500">Mesure</span> ${tsel(cfg, 'valCol', cfg.valCol, hs, '— colonne —')}
                    <span class="text-slate-500">Pas</span>
                    <select onchange="tsSet('${cfg.id}','step',this.value)" class="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white">
                      ${TS_STEPS.map(o => `<option value="${o.v}" ${String(cfg.step) === o.v ? 'selected' : ''}>${o.l}</option>`).join('')}</select>
                  </div>
                          </div>`;
                })
                .join('');
            const p = tsView.prof;
            const num = v => (v == null ? '—' : Number(v).toLocaleString('fr-FR'));
            const profHtml = !p
                ? ''
                : `<div class="mt-4">
              <h4 class="font-bold text-sm mb-2">Profil par série <span class="font-medium text-slate-400 text-xs">— ${p.length} série(s)</span></h4>
              <div class="overflow-x-auto border border-slate-200 rounded-xl">
              <table class="w-full text-xs"><thead><tr>
                <th>Série</th>
                  <th>Points</th>
                  <th>Période</th>
                  <th>Pas</th>
                  <th>Régularité</th>
                  <th>Trous</th>
                <th>Plus long trou</th>
                  <th>Couverture</th>
                  <th>Doublons</th>
                  <th>Plateau max</th>
                  <th>Retard</th>
                  <th>Min / Max</th>
                  </tr>
                  </thead>
              <tbody>${p
                  .map(r => {
                      const cad = r.cadencee === true || r.cadencee === 'true';
                      const bad = x => (x ? 'text-red-600 font-bold' : 'text-slate-400');
                      return `<tr>
                    <td class="font-bold">${escapeHTML(String(r.serie))}</td>
                    <td>${num(r.points)}</td>
                    <td class="text-slate-500">${r.debut ? new Date(r.debut).toLocaleDateString('fr-FR') : '—'} → ${r.fin ? new Date(r.fin).toLocaleDateString('fr-FR') : '—'}</td>
                    <td>${cad ? tsDur(r.pas_sec) : '<span class="text-slate-400 italic">événementielle</span>'}</td>
                    <td>${r.regularite == null ? '—' : Number(r.regularite).toFixed(0) + ' %'}</td>
                    <td class="${bad(Number(r.trous) > 0)}">${cad ? num(r.trous) : '—'}</td>
                    <td class="${bad(Number(r.trous) > 0)}">${cad && Number(r.trous) > 0 ? tsDur(r.plus_long_trou_sec) : '—'}</td>
                    <td class="${bad(r.couverture != null && Number(r.couverture) < 95)}">${r.couverture == null ? '—' : Number(r.couverture).toFixed(0) + ' %'}</td>
                    <td class="${bad(Number(r.doublons) > 0)}">${num(r.doublons)}</td>
                    <td class="${bad(Number(r.plateau_max) >= 5)}">${num(r.plateau_max)}</td>
                    <td class="${bad(Number(r.retard_sec) > 0)}">${Number(r.retard_sec) > 0 ? tsDur(r.retard_sec) : '—'}</td>
                    <td class="text-slate-500">${r.vmin == null ? '—' : num(r.vmin) + ' / ' + num(r.vmax)}</td></tr>`;
                  })
                  .join('')}</tbody></table></div></div>` + tsCalendarHtml();
            return `<div>
              <div class="flex items-center gap-3 flex-wrap mb-3">
                <h3 class="text-lg font-bold">Séries temporelles</h3>
                <button onclick="tsAdd()" class="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-bold">+ Déclarer une série</button>
              </div>
              <p class="text-xs text-slate-500 mb-3 max-w-3xl">Sur une série temporelle, une ligne n'est pas une entité mais une <b>observation</b> : l'entité est la série. Déclarez ici la clé de série, l'horodatage et la mesure — les contrôles « Série&nbsp;: … » de <b>Règles &amp; score</b> deviennent alors disponibles, et le défaut le plus fréquent, <b>la ligne qui n'existe pas</b>, devient visible.</p>
              ${list.length ? cards : '<div class="text-sm text-slate-400 italic border border-dashed border-slate-200 rounded-xl p-6 text-center">Aucune série déclarée.</div>'}
              ${tsView.busy ? '<div class="text-sm text-slate-500 mt-3">Analyse en cours…</div>' : profHtml}</div>`;
        }

        const QR_TYPES = {
            notnull: 'Non vide',
            unique: 'Unicité (mono/composite)',
            format: 'Format (regex)',
            range: 'Plage min/max',
            inlist: 'Liste de valeurs',
            fk: 'Intégrité référentielle',
            cond: 'Condition (si… alors…)',
            expr: 'Cohérence (expression)',
            fresh: 'Fraîcheur (date)',
            sql: 'Condition SQL libre (avancé)',
            group: 'Agrégat par groupe (avancé)',
            vlist: 'Appartenance à une liste de valeurs',
            ...QR_TS_TYPES
        };
        // V6.20 : règles évaluées à la maille GROUPE et non à la ligne — elles ont leur propre requête.
        const QR_GROUPED = ['unique', 'group'];
        const QR_W = { 'Faible': 1, 'Moyenne': 2, 'Haute': 3, 'Critique': 5 };
        let qrSnapshots = []; // instantanés E2 (persistés à part, comme l'historique qualité)
        let qrChartInst = null;
        function qrRules() {
            return (state.governance.qualityRules = state.governance.qualityRules || []);
        }
        // Règles de qualité rattachées à un objet métier : soit déclarées SUR l'objet (r.bo),
        // soit portant sur une table de son périmètre (maître + sources + composants).
        function boQualityRules(bo) {
            if (!bo) return [];
            const objTables = new Set();
            const table = boMasterTable(bo);
            if (table) objTables.add(table.name);
            (bo.sources || []).forEach(s => objTables.add(s.table));
            (bo.structure || []).forEach(s => objTables.add(s.table));
            return qrRules().filter(r => r.bo === bo.id || (r.table && objTables.has(r.table)));
        }
        // Évalue UNE règle de qualité (résout les règles « objet » vers leurs tables réelles) et
        // met à jour r.last. Renvoie { ran, total, fails, rate }.
        async function qrEvalRule(r, conn) {
            conn = conn || (await getDB()).conn;
            const units = r.bo ? qrBoResolutions(r).map(res => qrVirtual(r, res)) : r.table ? [r] : [];
            let total = 0,
                fails = 0,
                ran = false;
            for (const vr of units) {
                const table = tableByName(vr.table);
                if (!table || table.status !== 'ready') continue;
                const T = sqlIdent(duckTableName(table.id));
                if (vr.type === 'unique') {
                    const cols = qrUniqueKey(vr);
                    if (!cols.length) continue;
                    const k = `COALESCE(UPPER(TRIM(concat_ws(chr(1), ${cols.map(c2 => `CAST(${sqlIdent(c2)} AS VARCHAR)`).join(', ')}))), '')`;
                    const res = arrowResultToObjects(
                        await conn.query(
                            `SELECT (SELECT COUNT(*) FROM ${T})::BIGINT AS total, COALESCE(SUM(c), 0)::BIGINT AS fails FROM (SELECT COUNT(*)::BIGINT AS c FROM ${T} GROUP BY ${k} HAVING COUNT(*) > 1)`
                        )
                    )[0];
                    total += Number(res.total);
                    fails += Number(res.fails || 0);
                    ran = true;
                } else if (vr.type === 'group') {
                    const g = qrGroupSql(vr, T);
                    if (!g) continue;
                    const res = arrowResultToObjects(
                        await conn.query(
                            `SELECT COUNT(*)::BIGINT AS total, SUM(CASE WHEN ${g.bad} THEN 1 ELSE 0 END)::BIGINT AS fails FROM (${g.sql})`
                        )
                    )[0];
                    total += Number(res.total);
                    fails += Number(res.fails || 0);
                    ran = true;
                } else if (QR_SERIES.includes(vr.type)) {
                    // Maille SÉRIE : la requête porte sa propre unité (intervalle, point, horodatage
                    // ou série) — c'est le contrôle qui décide de ce qu'il compte.
                    const cfg = tsForTable(vr.table);
                    if (!tsCfgOk(cfg)) continue;
                    const sql = tsRuleQuery(vr, cfg, T);
                    if (!sql) continue;
                    const res = arrowResultToObjects(await conn.query(sql))[0];
                    total += Number(res.total || 0);
                    fails += Number(res.fails || 0);
                    ran = true;
                } else {
                    const fc = qrFailCond(vr);
                    if (!fc) continue;
                    const res = arrowResultToObjects(
                        await conn.query(
                            `SELECT COUNT(*)::BIGINT AS total, SUM(CASE WHEN ${fc} THEN 1 ELSE 0 END)::BIGINT AS fails FROM ${T}`
                        )
                    )[0];
                    total += Number(res.total);
                    fails += Number(res.fails || 0);
                    ran = true;
                }
            }
            if (ran) r.last = { at: Date.now(), total, fails, rate: total ? 1 - fails / total : 1 };
            return { ran, total, fails, rate: total ? 1 - fails / total : 1 };
        }
        function qrAdd() {
            qrRules().push({
                id: 'qr_' + generateId(),
                name: 'Nouvelle règle',
                table: '',
                col: '',
                type: 'notnull',
                p: {},
                crit: 'Moyenne',
                enabled: true
            });
            persistAppState();
            renderQualityRules();
        }
        function qrSet(id, f, v) {
            const rules = qrRules().find(x => x.id === id);
            if (!rules) return;
            if (f.startsWith('p.')) {
                rules.p = rules.p || {};
                rules.p[f.slice(2)] = v;
            } else rules[f] = v;
            if (f === 'table') {
                if (String(v).startsWith('bo:')) {
                    rules.bo = String(v).slice(3);
                    rules.table = '';
                } else rules.bo = null;
                rules.col = '';
                rules.p = {};
            }
            persistAppState();
            if (
                f === 'table' ||
                f === 'type' ||
                f === 'enabled' ||
                f === 'p.refTable' ||
                f === 'p.ifOp' ||
                f === 'p.thenOp' ||
                f === 'p.gAgg' ||
                f === 'p.sql'
            )
                renderQualityRules();
        }
        function qrDup(id) {
            const rules = qrRules().find(x => x.id === id);
            if (!rules) return;
            const parsed = JSON.parse(JSON.stringify(rules));
            parsed.id = 'qr_' + generateId();
            parsed.name = rules.name + ' (copie)';
            delete parsed.last;
            qrRules().push(parsed);
            persistAppState();
            renderQualityRules();
        }
        function qrDel(id) {
            state.governance.qualityRules = qrRules().filter(x => x.id !== id);
            persistAppState();
            renderQualityRules();
        }
