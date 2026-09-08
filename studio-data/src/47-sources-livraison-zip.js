        // ======================= Livraison ZIP (sans dépendance : DecompressionStream natif) =======================
        state.zipMappings = state.zipMappings || {};   // { dossier: { mode:'folder'|'files', dest:'domaine'|'', files:{ nomFichier: 'domaine'|'' } } }
        let _zipDelivery = null;                        // { name, buf, entries:[{name, folder, base, ...}] }
        const ZIP_EXTS = ['csv', 'txt', 'xlsx', 'xls'];
        function zipListEntries(buf) {
            const dv = new DataView(buf);
            let i = buf.byteLength - 22; const min = Math.max(0, buf.byteLength - 22 - 65535);
            while (i >= min && dv.getUint32(i, true) !== 0x06054b50) i--;
            if (i < min || i < 0) throw new Error('ZIP invalide (répertoire central introuvable).');
            const count = dv.getUint16(i + 10, true); let off = dv.getUint32(i + 16, true);
            const entries = []; const td = new TextDecoder();
            for (let k = 0; k < count; k++) {
                if (dv.getUint32(off, true) !== 0x02014b50) break;
                const method = dv.getUint16(off + 10, true);
                const mtime = dv.getUint16(off + 12, true), mdate = dv.getUint16(off + 14, true);
                const csize = dv.getUint32(off + 20, true);
                const nlen = dv.getUint16(off + 28, true), elen = dv.getUint16(off + 30, true), clen = dv.getUint16(off + 32, true);
                const lho = dv.getUint32(off + 42, true);
                const name = td.decode(new Uint8Array(buf, off + 46, nlen)).replace(/\\/g, '/');
                if (!name.endsWith('/')) {
                    const parts = name.split('/');
                    entries.push({ name, folder: parts.length > 1 ? parts[0] : '(racine)', base: parts[parts.length - 1], method, csize, lho,
                        lastModified: new Date(1980 + ((mdate >> 9) & 0x7f), ((mdate >> 5) & 0xf) - 1, mdate & 0x1f, (mtime >> 11) & 0x1f, (mtime >> 5) & 0x3f, (mtime & 0x1f) * 2).getTime() });
                }
                off += 46 + nlen + elen + clen;
            }
            return entries;
        }
        async function zipExtractEntry(buf, e) {
            const dv = new DataView(buf);
            if (dv.getUint32(e.lho, true) !== 0x04034b50) throw new Error('Entrée ZIP corrompue : ' + e.name);
            const nlen = dv.getUint16(e.lho + 26, true), elen = dv.getUint16(e.lho + 28, true);
            const start = e.lho + 30 + nlen + elen;
            const data = buf.slice(start, start + e.csize);
            if (e.method === 0) return new Uint8Array(data);
            if (e.method === 8) {
                const resp = new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')));
                return new Uint8Array(await resp.arrayBuffer());
            }
            throw new Error('Compression ZIP non gérée (méthode ' + e.method + ') pour ' + e.name);
        }
        async function zipDeliveryLoad(inputEl) {
            const f = inputEl.files && inputEl.files[0]; if (!f) return; inputEl.value = '';
            try {
                const buf = await f.arrayBuffer();
                const entries = zipListEntries(buf).filter(e => ZIP_EXTS.includes(e.base.split('.').pop().toLowerCase()) && !e.base.startsWith('.'));
                if (!entries.length) throw new Error('Aucun fichier CSV / TXT / Excel dans ce ZIP.');
                _zipDelivery = { name: f.name, buf, entries };
                // Pré-applique le mapping mémorisé ; les nouveaux dossiers ciblent un domaine du même nom.
                const folders = [...new Set(entries.map(e => e.folder))];
                folders.forEach(fo => { if (!state.zipMappings[fo]) state.zipMappings[fo] = { mode: 'folder', dest: fo === '(racine)' ? '' : fo, files: {} }; });
                renderZipMapping();
                showSuccess(`📦 « ${f.name} » : ${entries.length} fichier(s) dans ${folders.length} dossier(s) — vérifiez le mapping puis importez.`);
            } catch (e) { showError('Lecture du ZIP impossible : ' + e.message); }
        }
        function zipSetMap(folder, field, v) { const m = state.zipMappings[folder]; if (!m) return; m[field] = v; persistAppState(); renderZipMapping(); }
        function zipSetFileMap(folder, base, v) { const m = state.zipMappings[folder]; if (!m) return; m.files[base] = v; persistAppState(); }
        function renderZipMapping() {
            const area = el('zipMapArea'); if (!area || !_zipDelivery) return;
            const folders = [...new Set(_zipDelivery.entries.map(e => e.folder))];
            const doms = themeList();
            const destOpts = (cur, folder) => {
                const cands = [...new Set([folder !== '(racine)' ? folder : '', ...doms])].filter(Boolean);
                return `<option value="__ignore__" ${cur === '__ignore__' ? 'selected' : ''}>⤫ ignorer</option>` +
                    cands.map(d => `<option value="${escapeHTML(d)}" ${cur === d ? 'selected' : ''}>→ domaine ${escapeHTML(d)}</option>`).join('') +
                    `<option value="__custom__">🆕 autre domaine…</option>` +
                    `<option value="" ${cur === '' ? 'selected' : ''}>→ sans domaine</option>`;
            };
            area.innerHTML = `<div class="text-[11px] font-bold text-slate-600 mb-1">📦 ${escapeHTML(_zipDelivery.name)} — mapping (mémorisé pour les prochains ZIP)</div>
                ${folders.map(fo => { const m = state.zipMappings[fo]; const files = _zipDelivery.entries.filter(e => e.folder === fo);
                    return `<div class="bg-white border border-slate-200 rounded p-2 mb-1.5">
                    <div class="flex items-center gap-2 flex-wrap text-[11px]">
                        <span class="font-bold text-slate-700">📁 ${escapeHTML(fo)}</span><span class="text-slate-400">${files.length} fichier(s)</span>
                        <select onchange="if(this.value==='__custom__'){const d=prompt('Nom du domaine :'); if(d) zipSetMap('${escapeHTML(fo)}','dest',d); else renderZipMapping();} else zipSetMap('${escapeHTML(fo)}','dest',this.value)" class="border border-slate-300 rounded px-1 py-0.5 text-[11px] bg-white" ${m.mode === 'files' ? 'disabled' : ''}>${destOpts(m.dest, fo)}</select>
                        <label class="flex items-center gap-1 ml-auto cursor-pointer text-slate-500"><input type="checkbox" ${m.mode === 'files' ? 'checked' : ''} onchange="zipSetMap('${escapeHTML(fo)}','mode',this.checked?'files':'folder')"> détail par fichier</label>
                    </div>
                    ${m.mode === 'files' ? `<div class="mt-1.5 space-y-1 pl-4">${files.map(e => { const cur = (e.base in m.files) ? m.files[e.base] : m.dest;
                        return `<div class="flex items-center gap-2 text-[11px]"><span class="text-slate-600 truncate max-w-[220px]">${escapeHTML(e.base)}</span>
                        <select onchange="if(this.value==='__custom__'){const d=prompt('Nom du domaine :'); if(d) { zipSetFileMap('${escapeHTML(fo)}','${escapeHTML(e.base.replace(/'/g, "\\'"))}',d); renderZipMapping(); } else renderZipMapping();} else zipSetFileMap('${escapeHTML(fo)}','${escapeHTML(e.base.replace(/'/g, "\\'"))}',this.value)" class="border border-slate-200 rounded px-1 py-0.5 text-[11px] bg-white">${destOpts(cur, fo)}</select></div>`; }).join('')}</div>` : ''}
                </div>`; }).join('')}
                <button onclick="zipDeliveryImport(this)" class="text-[11px] bg-emerald-600 text-white px-3 py-1.5 rounded font-bold mt-1">🚚 Importer selon le mapping</button>
                <p class="text-[10px] text-slate-400 mt-1">Fichier du même nom qu'une source existante → <strong>mise à jour</strong> de la source · nouveau nom → <strong>import</strong> dans le domaine choisi · l'app n'écrit pas sur votre disque (vos dossiers restent inchangés).</p>`;
        }
        async function zipDeliveryImport(btn) {
            if (!_zipDelivery) return;
            if (btn) btn.disabled = true;
            bgTaskStart('Import de la livraison ZIP en cours');
            let refreshed = 0, imported = 0, ignored = 0, errors = 0;
            try {
                for (const e of _zipDelivery.entries) {
                    const m = state.zipMappings[e.folder] || { mode: 'folder', dest: '', files: {} };
                    const dest = m.mode === 'files' ? ((e.base in m.files) ? m.files[e.base] : m.dest) : m.dest;
                    if (dest === '__ignore__') { ignored++; continue; }
                    try {
                        const bytes = await zipExtractEntry(_zipDelivery.buf, e);
                        const file = new File([bytes], e.base, { lastModified: e.lastModified || Date.now() });
                        const existing = Object.keys(state.tables).find(tid => state.tables[tid].name.toLowerCase() === e.base.toLowerCase());
                        if (existing) {
                            const tt = state.tables[existing]; if (tt && !tt.theme && dest) tt.theme = dest;
                            const r = await refreshTableFromFile(existing, file, { skipUnchanged: false });
                            if (r && (r.refreshed || !r.skipped)) refreshed++;
                        } else {
                            const nid = await loadNewSourceFromFile(file);
                            if (nid) { imported++; const tt = state.tables[nid]; if (tt && dest && !tt.theme) { tt.theme = dest; } } else errors++;
                        }
                    } catch (e2) { errors++; console.warn('ZIP : import impossible pour', e.name, e2); }
                }
                persistAppState(); renderTables();
                bgTaskEnd(`📦 Livraison « ${_zipDelivery.name} » : ${refreshed} mise(s) à jour, ${imported} import(s), ${ignored} ignoré(s)${errors ? ', ' + errors + ' erreur(s)' : ''}.`);
            } catch (e) { bgTaskEnd(); showError('Import du ZIP impossible : ' + e.message); }
            finally { if (btn) btn.disabled = false; }
        }

